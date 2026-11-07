import { internalFullScope } from "@brains/plugins";
import type {
  IRuntimeStateNamespace,
  ServiceEntityService,
} from "@brains/plugins";
import {
  FormStorageSlots,
  type FormAdmission,
  type FormDenialReason as ContactDenialReason,
} from "@brains/forms";
import { contactRequestAdapter } from "./entity/adapter";
import {
  contactMetadataSchema,
  contactRequestSchema,
  contactSubmissionSchema,
  type ContactRequest,
  type ContactSubmission,
} from "./entity/schema";
import { CONTACT_SLOTS } from "./state";

export interface ContactIntakeDependencies {
  admission: FormAdmission;
  entities: ServiceEntityService;
  state: IRuntimeStateNamespace;
  /** Fewer submissions in flight than the ledger allows, for tests. */
  maxInFlight?: number | undefined;
  /** Durable enqueue only, with a request-derived deduplication key. Never send email inline. */
  enqueueNotification: (id: string) => Promise<void>;
  now?: () => number;
}
export type ContactSaveResult =
  | { kind: "saved"; id: string }
  | { kind: "denied"; reason: ContactDenialReason };
export interface ContactMaintenanceReport {
  /** Slots freed: their alert settled and was dealt with, or their request was deleted. */
  released: number;
  pendingNotifications: number;
  enqueueFailures: number;
  uncertainWrites: number;
}

export class ContactIntake {
  private readonly slots: FormStorageSlots;
  private readonly now: () => number;
  private readonly deps: ContactIntakeDependencies;

  constructor(deps: ContactIntakeDependencies) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.slots = new FormStorageSlots(
      deps.state,
      { ...CONTACT_SLOTS, maxInFlight: deps.maxInFlight },
      this.now,
    );
  }

  async submit(
    token: string,
    input: unknown,
    peer: string | undefined,
    signal: AbortSignal,
  ): Promise<ContactSaveResult> {
    try {
      signal.throwIfAborted();
      const parsed = contactSubmissionSchema.safeParse(input);
      if (!parsed.success)
        return { kind: "denied", reason: "invalid-submission" };
      const reservation = await this.deps.admission.reserve(
        token,
        parsed.data,
        peer,
      );
      if (reservation.kind === "denied") return reservation;
      signal.throwIfAborted();
      const { id, receivedAt } = reservation;
      const content = this.content(parsed.data, receivedAt);
      // Reserve canonical UTF-8 content plus bounded room for operational status changes.
      const claim = await this.slots.claim(
        id,
        receivedAt,
        Buffer.byteLength(content) + 256,
      );
      if (claim.kind === "capacity")
        return { kind: "denied", reason: "capacity" };
      if (claim.kind === "new") {
        await this.create(id, content, signal);
      }
      // A receipt/slot is not an acknowledgement. Observe the exact persisted
      // request before reporting success, including after an ambiguous create.
      const entity = await this.read(id);
      if (!entity || !this.matches(entity, parsed.data, claim.slot.receivedAt))
        return { kind: "denied", reason: "unavailable" };
      if (!(await this.slots.stored(id)))
        return { kind: "denied", reason: "unavailable" };
      signal.throwIfAborted();
      if (
        contactRequestAdapter.parseContent(entity.content).frontmatter
          .notification === "pending"
      )
        await this.enqueue(id);
      return { kind: "saved", id };
    } catch {
      // Storage and validation errors can contain private fields. Preserve all
      // uncertain reservations; neither an error nor a disconnect proves rollback.
      return { kind: "denied", reason: "unavailable" };
    }
  }

  /** A bounded recovery pass. It deletes nothing: requests are kept until their
   * owner deletes them. Schedule through the owning plugin, never an unowned
   * interval. Queue jobs contain an id only, not the contact message.
   */
  async maintain(signal: AbortSignal): Promise<ContactMaintenanceReport> {
    signal.throwIfAborted();
    const report: ContactMaintenanceReport = {
      released: 0,
      pendingNotifications: 0,
      enqueueFailures: 0,
      uncertainWrites: 0,
    };
    try {
      for (const [id, slot] of await this.slots.list()) {
        signal.throwIfAborted();
        const entity = await this.read(id);
        signal.throwIfAborted();
        if (slot.phase === "writing" && !entity) {
          report.uncertainWrites++;
          continue; // A late write may still commit. No elapsed-time quota refund.
        }
        if (slot.phase === "writing" && !(await this.slots.stored(id)))
          continue;
        if (!entity) {
          // Its owner deleted it: nothing is left to alert about.
          if (await this.slots.releaseGone(id)) report.released++;
          continue;
        }
        const { frontmatter } = contactRequestAdapter.parseContent(
          entity.content,
        );
        if (
          frontmatter.notification === "pending" ||
          (slot.delivery.status === "sent" &&
            frontmatter.notification !== "sent")
        ) {
          report.pendingNotifications++;
          if (!(await this.enqueue(id))) report.enqueueFailures++;
          continue;
        }
        // A sent alert is done; a failed one, once its request is dealt with.
        if (
          (slot.delivery.status === "sent" ||
            frontmatter.status === "handled") &&
          (await this.slots.release(id))
        )
          report.released++;
      }
      return report;
    } catch {
      signal.throwIfAborted();
      throw new Error("Contact maintenance unavailable");
    }
  }

  private content(input: ContactSubmission, receivedAt: number): string {
    return contactRequestAdapter.createContent(
      {
        name: input.name,
        email: input.email,
        receivedAt: new Date(receivedAt).toISOString(),
        status: "new",
        notification: "pending",
      },
      input.message,
    );
  }

  private async create(
    id: string,
    content: string,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const metadata = contactMetadataSchema.parse(
      contactRequestAdapter.fromMarkdown(content).metadata,
    );
    try {
      await this.deps.entities.createEntity({
        entity: {
          id,
          entityType: "contact-request",
          visibility: "restricted",
          content,
          metadata,
        },
        options: {
          signal,
          conditionalWrite: { expectedRevision: null },
          beforeWrite: async (): Promise<void> => {
            signal.throwIfAborted();
            await this.slots.assertWritable(id);
          },
        },
      });
    } catch {
      // Conditional conflicts and lost acknowledgements are reconciled by the
      // caller's read. Never issue a second create for an existing write slot.
    }
  }

  private read(id: string): Promise<ContactRequest | null> {
    return this.deps.entities.getEntity(
      {
        entityType: "contact-request",
        id,
        visibilityScope: internalFullScope(
          "contact intake idempotency; no content returned",
        ),
      },
      contactRequestSchema,
    );
  }

  private matches(
    entity: ContactRequest,
    input: ContactSubmission,
    receivedAt: number,
  ): boolean {
    const { frontmatter, message } = contactRequestAdapter.parseContent(
      entity.content,
    );
    return (
      frontmatter.name === input.name &&
      frontmatter.email === input.email &&
      message === input.message &&
      Date.parse(frontmatter.receivedAt) === receivedAt
    );
  }

  private async enqueue(id: string): Promise<boolean> {
    try {
      await this.deps.enqueueNotification(id);
      return true;
    } catch {
      // The durable pending marker stays in the entity; maintenance can recover
      // a crash or an unavailable queue without losing or recreating the request.
      return false;
    }
  }
}
