import type { FormDenialReason } from "./admission";
import { FORM_FIELD_MESSAGES, type FormFieldMessages } from "./validate";

/** What the engine itself says to a visitor, beside a form's own copy. A
 * target's built-in form may say it in its own words. */
export interface FormCopy {
  /** Beside an optional field's label. */
  optional: string;
  /** The honeypot's label, read only by bots and screen readers it is hidden from. */
  trap: string;
  /** Why a submission or a form was refused. */
  denials: Record<FormDenialReason, string>;
  /** A request the form never serves. */
  denied: string;
  notFound: string;
  methodNotAllowed: string;
  mediaType: string;
  /** Shown while the form takes nothing. */
  paused: { title: string; body: string };
  /** A refusal before any form was issued. */
  refusedTitle: string;
  newForm: string;
  /** Where the owner's name stands when the site names none. */
  ownerFallback: string;
  fields: FormFieldMessages;
}

export const FORM_COPY: FormCopy = {
  optional: "(optional)",
  trap: "Leave this empty",
  denials: {
    "invalid-network": "Submissions can’t be sent from this connection.",
    "invalid-submission": "Check the marked fields before retrying.",
    "invalid-token":
      "This form is unavailable or expired. Copy your answers before opening a new form.",
    "submission-conflict":
      "This form already sent different answers. To send again, open a new form.",
    "rate-limited": "Too many requests. Please wait before retrying this form.",
    capacity:
      "There’s no room for new submissions right now. Please try this same form again later.",
    unavailable:
      "Your answers couldn’t be confirmed as saved. Send this same form again rather than opening a new one.",
  },
  denied: "Request denied.",
  notFound: "Page not found.",
  methodNotAllowed: "Method not allowed.",
  mediaType: "A URL-encoded form is required. Attachments are not accepted.",
  paused: {
    title: "This form is paused",
    body: "Submissions can’t be received right now. Please try this same form again later.",
  },
  refusedTitle: "Form unavailable",
  newForm: "Open a new form",
  ownerFallback: "the owner of this site",
  fields: FORM_FIELD_MESSAGES,
};
