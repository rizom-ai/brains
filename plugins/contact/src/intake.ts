import type { IRuntimeStateNamespace } from "@brains/sdk/services";
import type { JobEntityAccess } from "@brains/sdk/entities";
import type { ContactAdmission, ContactDenialReason } from "./admission";
import { contactRequestAdapter } from "./entity/adapter";
import {
  contactMetadataSchema,
  contactRequestSchema,
  contactSubmissionSchema,
  type ContactRequest,
  type ContactSubmission,
} from "./entity/schema";
import {
  ContactStorageSlots,
  contactStoragePolicySchema,
  type ContactStoragePolicy,
} from "./storage-slots";

export interface ContactIntakeDependencies {
  admission: ContactAdmission;
  entities: Pick<JobEntityAccess, "getEntity" | "create" | "delete">;
  state: IRuntimeStateNamespace;
  policy: ContactStoragePolicy;
  /** Durable enqueue only, with a request-derived deduplication key. Never send email inline. */
  enqueueNotification: (id: string) => Promise<void>;
  now?: () => number;
}
export type ContactSaveResult =
  | { kind: "saved"; id: string }
  | { kind: "denied"; reason: ContactDenialReason };
export interface ContactMaintenanceReport {
  deleted: number;
  pendingNotifications: number;
  enqueueFailures: number;
  uncertainWrites: number;
}

export class ContactIntake {
  readonly retentionSeconds: number;
  private readonly slots: ContactStorageSlots;
  private readonly now: () => number;
  private readonly deps: ContactIntakeDependencies;

  constructor(deps: ContactIntakeDependencies) {
    this.deps = deps;
    const policy = contactStoragePolicySchema.parse(deps.policy);
    this.retentionSeconds = policy.retentionSeconds;
    this.now = deps.now ?? Date.now;
    this.slots = new ContactStorageSlots(deps.state, policy, this.now);
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
      const content = this.content(
        parsed.data,
        receivedAt,
        receivedAt + this.retentionSeconds * 1000,
      );
      // Reserve canonical UTF-8 content plus bounded room for operational status changes.
      const claim = await this.slots.claim(
        id,
        receivedAt,
        Buffer.byteLength(content) + 256,
      );
      if (claim.kind === "capacity")
        return { kind: "denied", reason: "capacity" };
      if (claim.kind === "expired")
        return { kind: "denied", reason: "invalid-token" };
      if (this.now() >= claim.slot.expiresAt)
        return { kind: "denied", reason: "invalid-token" };
      if (claim.kind === "new") {
        await this.create(id, content, signal);
      }
      // A receipt/slot is not an acknowledgement. Observe the exact persisted
      // request before reporting success, including after an ambiguous create.
      const entity = await this.read(id);
      if (
        !entity ||
        !this.matches(
          entity,
          parsed.data,
          claim.slot.receivedAt,
          claim.slot.expiresAt,
        )
      )
        return { kind: "denied", reason: "unavailable" };
      if (!(await this.slots.stored(id)))
        return { kind: "denied", reason: "unavailable" };
      signal.throwIfAborted();
      if (this.now() >= claim.slot.expiresAt)
        return { kind: "denied", reason: "invalid-token" };
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

  /** A bounded recovery/retention pass. Schedule through the owning plugin, never
   * an unowned interval. Queue jobs contain an id only, not the contact message.
   */
  async maintain(signal: AbortSignal): Promise<ContactMaintenanceReport> {
    signal.throwIfAborted();
    const report: ContactMaintenanceReport = {
      deleted: 0,
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
        if (this.now() >= slot.expiresAt) {
          if (entity) await this.deps.entities.delete("contact-request", id);
          signal.throwIfAborted();
          if (await this.read(id))
            throw new Error("Contact deletion not confirmed");
          if (await this.slots.releaseDeleted(id)) report.deleted++;
          continue;
        }
        if (
          entity &&
          (contactRequestAdapter.parseContent(entity.content).frontmatter
            .notification === "pending" ||
            (slot.delivery.status === "sent" &&
              entity.metadata.notification !== "sent"))
        ) {
          report.pendingNotifications++;
          if (!(await this.enqueue(id))) report.enqueueFailures++;
        }
      }
      return report;
    } catch {
      signal.throwIfAborted();
      throw new Error("Contact maintenance unavailable");
    }
  }

  private content(
    input: ContactSubmission,
    receivedAt: number,
    expiresAt: number,
  ): string {
    return contactRequestAdapter.createContent(
      {
        name: input.name,
        email: input.email,
        receivedAt: new Date(receivedAt).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
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
      await this.deps.entities.create(
        {
          id,
          entityType: "contact-request",
          visibility: "restricted",
          content,
          metadata,
        },
        {
          signal,
          conditionalWrite: { expectedRevision: null },
          beforeWrite: async (): Promise<void> => {
            signal.throwIfAborted();
            await this.slots.assertWritable(id);
          },
        },
      );
    } catch {
      // Conditional conflicts and lost acknowledgements are reconciled by the
      // caller's read. Never issue a second create for an existing write slot.
    }
  }

  private read(id: string): Promise<ContactRequest | null> {
    return this.deps.entities.getEntity(
      { entityType: "contact-request", id, visibilityScope: "restricted" },
      contactRequestSchema,
    );
  }

  private matches(
    entity: ContactRequest,
    input: ContactSubmission,
    receivedAt: number,
    expiresAt: number,
  ): boolean {
    const { frontmatter, message } = contactRequestAdapter.parseContent(
      entity.content,
    );
    return (
      frontmatter.name === input.name &&
      frontmatter.email === input.email &&
      message === input.message &&
      Date.parse(frontmatter.receivedAt) === receivedAt &&
      Date.parse(frontmatter.expiresAt) === expiresAt
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
