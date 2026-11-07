import { z } from "@brains/utils/zod";
import {
  RESERVED_FIELD_IDS,
  formFields,
  type FormDefinition,
} from "./definition";

/** A submission's answers by field id, each as the visitor gave it, trimmed. */
export type FormAnswers = Record<string, string>;
/** Each failing field's id with why it fails; empty when the post itself is
 * not one of the form's (a filled honeypot, a field it does not have). */
export type FormValidation =
  | { ok: true; answers: FormAnswers }
  | { ok: false; errors: Record<string, string> };

/** Why an answer fails, in the visitor's words. */
export interface FormFieldMessages {
  required: (label: string) => string;
  tooLong: (label: string, max: number) => string;
  email: (label: string) => string;
}
export const FORM_FIELD_MESSAGES: FormFieldMessages = {
  required: (label) => `${label} is required.`,
  tooLong: (label, max) => `${label} is too long: at most ${max} characters.`,
  email: () => "Enter an email address.",
};

const emailSchema = z.email();

export function validateAnswers(
  form: FormDefinition,
  posted: Record<string, string>,
  messages: FormFieldMessages = FORM_FIELD_MESSAGES,
): FormValidation {
  const fields = formFields(form);
  const known = new Set([...RESERVED_FIELD_IDS, ...fields.map((f) => f.id)]);
  if (
    Object.keys(posted).some((key) => !known.has(key)) ||
    (posted["website"] ?? "") !== ""
  )
    return { ok: false, errors: {} };
  const answers: FormAnswers = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = (posted[field.id] ?? "").trim();
    answers[field.id] = value;
    if (field.required && value === "")
      errors[field.id] = messages.required(field.label);
    else if (value.length > field.maxLength)
      errors[field.id] = messages.tooLong(field.label, field.maxLength);
    else if (
      field.kind === "email" &&
      value !== "" &&
      !emailSchema.safeParse(value).success
    )
      errors[field.id] = messages.email(field.label);
  }
  return Object.keys(errors).length === 0
    ? { ok: true, answers }
    : { ok: false, errors };
}
