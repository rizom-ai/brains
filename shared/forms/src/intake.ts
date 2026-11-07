import type {
  BaseEntity,
  IRuntimeStateNamespace,
  ServiceEntityService,
} from "@brains/plugins";
import type { FormAdmission, FormDenialReason } from "./admission";
import type { FormDefinition } from "./definition";
import { FormRecords } from "./records";
import { FormStorageSlots, type FormStorageOptions } from "./storage-slots";
import { scoreAnswers, type FormResult } from "./score";
import type { FormSubmission, FormTarget } from "./target";
import {
  FORM_FIELD_MESSAGES,
  validateAnswers,
  type FormFieldMessages,
} from "./validate";

export interface FormIntakeDependencies<E extends BaseEntity = BaseEntity> {
  form: FormDefinition;
  target: FormTarget<E>;
  admission: FormAdmission;
  entities: ServiceEntityService;
  state: IRuntimeStateNamespace;
  /** Where its in-flight ledger lives and how its records are named. */
  slots: FormStorageOptions;
  /** Durable enqueue only, with a request-derived deduplication key. Never send email inline. */
  enqueueNotification: (id: string) => Promise<void>;
  messages?: FormFieldMessages | undefined;
  now?: () => number;
}
export type FormSaveResult =
  | {
      kind: "saved";
      id: string;
      /** A scored form's results, for the visitor's thanks page. */
      results: FormResult[];
    }
  | {
      kind: "denied";
      reason: FormDenialReason;
      /** Each failing field's id and why, for an invalid submission. */
      errors?: Record<string, string> | undefined;
    };
export interface FormMaintenanceReport {
  /** Slots freed: their alert settled and was dealt with, or their record was deleted. */
  released: number;
  pendingNotifications: number;
  enqueueFailures: number;
  uncertainWrites: number;
}

/** One form's intake: a valid post becomes one record of its target's type. */
export class FormIntake<E extends BaseEntity = BaseEntity> {
  private readonly slots: FormStorageSlots;
  private readonly records: FormRecords<E>;
  private readonly now: () => number;
  private readonly deps: FormIntakeDependencies<E>;

  constructor(deps: FormIntakeDependencies<E>) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.slots = new FormStorageSlots(deps.state, deps.slots, this.now);
    this.records = new FormRecords(deps.entities, deps.target);
  }

  async submit(
    token: string,
    posted: Record<string, string | string[]>,
    peer: string | undefined,
    signal: AbortSignal,
  ): Promise<FormSaveResult> {
    try {
      signal.throwIfAborted();
      const validation = validateAnswers(
        this.deps.form,
        posted,
        this.deps.messages ?? FORM_FIELD_MESSAGES,
      );
      if (!validation.ok)
        return {
          kind: "denied",
          reason: "invalid-submission",
          errors: validation.errors,
        };
      const reservation = await this.deps.admission.reserve(
        token,
        validation.answers,
        peer,
      );
      if (reservation.kind === "denied") return reservation;
      signal.throwIfAborted();
      const { id, receivedAt } = reservation;
      const submission: FormSubmission = {
        form: this.deps.form,
        answers: validation.answers,
        receivedAt,
        notify: this.deps.form.notify.enabled,
        results: scoreAnswers(this.deps.form, validation.answers),
      };
      const record = this.deps.target.record(submission);
      // Reserve canonical UTF-8 content plus bounded room for operational status changes.
      const claim = await this.slots.claim(
        id,
        receivedAt,
        Buffer.byteLength(record.content) + 256,
      );
      if (claim.kind === "capacity")
        return { kind: "denied", reason: "capacity" };
      if (claim.kind === "new") await this.create(id, record, signal);
      // A receipt/slot is not an acknowledgement. Observe the exact persisted
      // record before reporting success, including after an ambiguous create.
      const entity = await this.records.read(id);
      if (
        !entity ||
        !this.deps.target.matches(entity, {
          ...submission,
          receivedAt: claim.slot.receivedAt,
        })
      )
        return { kind: "denied", reason: "unavailable" };
      if (!(await this.slots.stored(id)))
        return { kind: "denied", reason: "unavailable" };
      signal.throwIfAborted();
      const notification = this.deps.target.notification(entity);
      if (notification === "pending") await this.enqueue(id);
      // Its form sends no alert: the record is all there was to do.
      if (notification === "none") await this.slots.forget(id);
      return { kind: "saved", id, results: submission.results };
    } catch {
      // Storage and validation errors can contain private fields. Preserve all
      // uncertain reservations; neither an error nor a disconnect proves rollback.
      return { kind: "denied", reason: "unavailable" };
    }
  }

  /** A bounded recovery pass. It deletes nothing: records are kept until their
   * owner deletes them. Schedule through the owning plugin, never an unowned
   * interval. Queue jobs contain an id only, never submitted content.
   */
  async maintain(signal: AbortSignal): Promise<FormMaintenanceReport> {
    signal.throwIfAborted();
    const report: FormMaintenanceReport = {
      released: 0,
      pendingNotifications: 0,
      enqueueFailures: 0,
      uncertainWrites: 0,
    };
    try {
      for (const [id, slot] of await this.slots.list()) {
        signal.throwIfAborted();
        const entity = await this.records.read(id);
        signal.throwIfAborted();
        if (slot.phase === "writing" && !entity) {
          report.uncertainWrites++;
          continue; // A late write may still commit. No elapsed-time quota refund.
        }
        if (slot.phase === "writing" && !(await this.slots.stored(id)))
          continue;
        const notification = entity
          ? this.deps.target.notification(entity)
          : "none";
        if (!entity || notification === "none") {
          // Its owner deleted it, or its form sends no alert: nothing is left
          // to alert about.
          if (await this.slots.forget(id)) report.released++;
          continue;
        }
        if (
          notification === "pending" ||
          (slot.delivery.status === "sent" && notification !== "sent")
        ) {
          report.pendingNotifications++;
          if (!(await this.enqueue(id))) report.enqueueFailures++;
          continue;
        }
        // A sent alert is done; a failed one, once its record is dealt with.
        if (
          (slot.delivery.status === "sent" ||
            this.deps.target.handled(entity)) &&
          (await this.slots.release(id))
        )
          report.released++;
      }
      return report;
    } catch {
      signal.throwIfAborted();
      throw new Error("Form maintenance unavailable");
    }
  }

  private async create(
    id: string,
    record: { content: string; metadata: Record<string, unknown> },
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    try {
      await this.deps.entities.createEntity({
        entity: {
          id,
          entityType: this.deps.target.entityType,
          visibility: "restricted",
          content: record.content,
          metadata: record.metadata,
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

  private async enqueue(id: string): Promise<boolean> {
    try {
      await this.deps.enqueueNotification(id);
      return true;
    } catch {
      // The durable pending marker stays in the record; maintenance can recover
      // a crash or an unavailable queue without losing or recreating it.
      return false;
    }
  }
}
