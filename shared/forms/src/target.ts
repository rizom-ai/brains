import type { BaseEntity, InboxItem } from "@brains/plugins";
import type { z } from "@brains/utils/zod";
import type { FormAlertAnswer } from "./alert";
import type { FormDefinition } from "./definition";
import type { FormNotificationState } from "./delivery";
import type { FormResult } from "./score";
import type { FormAnswers } from "./validate";

/** One accepted submission, before it is stored. */
export interface FormSubmission {
  form: FormDefinition;
  answers: FormAnswers;
  receivedAt: number;
  /** Whether the owner is alerted; a record without an alert says none. */
  notify: boolean;
  /** A scored form's result in each dimension it scored. */
  results: FormResult[];
  /** The language it was answered in, when not the one the form is written in. */
  language?: string | undefined;
}

/** A record as its package writes it: markdown and the metadata queried. */
export interface FormRecord {
  content: string;
  metadata: Record<string, unknown>;
}

/** What one record shows in the Inbox list. */
export type FormInboxItem = Pick<InboxItem, "title" | "summary" | "receivedAt">;

/**
 * A target whose new records are to-dos in the owner's Inbox, each marked
 * Done there. The engine lists, reads and marks them; the target says what
 * they mean.
 */
export interface FormInbox<E extends BaseEntity = BaseEntity> {
  readonly sourceId: string;
  readonly displayName: string;
  /** Names the source in its errors: "Contact" for "Contact inbox
   * unavailable". */
  readonly label: string;
  /** Names one record in its errors: "Contact request" for "Contact request
   * unavailable". */
  readonly recordLabel: string;
  /** Metadata a new record also has when it is a to-do. */
  readonly listFilter?: Record<string, unknown> | undefined;
  /** A new record as listed, or nothing when it is no to-do. */
  item(entity: E): FormInboxItem | undefined;
  /** The admin-only plain-text detail: who sent it and what. */
  detail(entity: E): string;
  /** The record once its owner has dealt with it. */
  withHandled(entity: E): FormRecord;
}

/**
 * The package that owns a form's submissions: it stores each as its own
 * entity type and says what its records mean. The engine never interprets
 * a record itself.
 */
export interface FormTarget<E extends BaseEntity = BaseEntity> {
  readonly entityType: string;
  /** `:` files the type's records in a folder per form, as Studio lists
   * them (`brand-test:<key>`); `-` (the default) keeps them side by side. */
  readonly idSeparator?: "-" | ":" | undefined;
  readonly schema: z.ZodType<E>;
  /** Why a form cannot produce this type, or nothing when it can. */
  refuse(form: FormDefinition): string | undefined;
  /** The new record for a submission, its alert pending, or none when its
   * form sends none. */
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
  ): {
    answers: FormAlertAnswer[];
    outcomes?: FormAlertAnswer[] | undefined;
    replyTo?: string | undefined;
  };
  /** Its records in the owner's Inbox, when they are to-dos there. */
  readonly inbox?: FormInbox<E> | undefined;
}

/** A target whose records are to-dos in the owner's Inbox. */
export type FormInboxTarget<E extends BaseEntity = BaseEntity> =
  FormTarget<E> & {
    readonly inbox: FormInbox<E>;
  };
