import type { BaseEntity } from "@brains/plugins";
import type { z } from "@brains/utils/zod";
import type { FormAlertAnswer } from "./alert";
import type { FormDefinition } from "./definition";
import type { FormNotificationState } from "./delivery";
import type { FormAnswers } from "./validate";

/** One accepted submission, before it is stored. */
export interface FormSubmission {
  form: FormDefinition;
  answers: FormAnswers;
  receivedAt: number;
}

/** A record as its package writes it: markdown and the metadata queried. */
export interface FormRecord {
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * The package that owns a form's submissions: it stores each as its own
 * entity type and says what its records mean. The engine never interprets
 * a record itself.
 */
export interface FormTarget<E extends BaseEntity = BaseEntity> {
  readonly entityType: string;
  readonly schema: z.ZodType<E>;
  /** Why a form cannot produce this type, or nothing when it can. */
  refuse(form: FormDefinition): string | undefined;
  /** The new record for a submission, its alert pending. */
  record(submission: FormSubmission): FormRecord;
  /** Whether a stored record is this submission, read back after a write. */
  matches(entity: E, submission: FormSubmission): boolean;
  notification(entity: E): FormNotificationState;
  withNotification(entity: E, notification: "sent" | "failed"): FormRecord;
  /** Whether its owner has dealt with it. */
  handled(entity: E): boolean;
  /** What the owner's alert carries, and who answering it reaches. */
  alert(
    entity: E,
    form: FormDefinition,
  ): { answers: FormAlertAnswer[]; replyTo?: string | undefined };
}
