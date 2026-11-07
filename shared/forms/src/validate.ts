import { z } from "@brains/utils/zod";
import {
  RESERVED_FIELD_IDS,
  formFields,
  type FormDefinition,
  type FormField,
} from "./definition";

/** A submission's answers by field id: text as given, trimmed, and a
 * choice of several as the list chosen, each once. */
export type FormAnswers = Record<string, string | string[]>;
/** Each failing field's id with why it fails; empty when the post itself is
 * not one of the form's (a filled honeypot, a field it does not have, a
 * list where it asks one answer). */
export type FormValidation =
  | { ok: true; answers: FormAnswers }
  | { ok: false; errors: Record<string, string> };

/** Why an answer fails, in the visitor's words. */
export interface FormFieldMessages {
  required: (label: string) => string;
  tooLong: (label: string, max: number) => string;
  email: (label: string) => string;
  /** No option chosen where one is required. */
  choose: (label: string) => string;
  /** An answer that is not one of the field's options. */
  offList: (label: string) => string;
  tooMany: (label: string, max: number) => string;
}
export const FORM_FIELD_MESSAGES: FormFieldMessages = {
  required: (label) => `${label} is required.`,
  tooLong: (label, max) => `${label} is too long: at most ${max} characters.`,
  email: () => "Enter an email address.",
  choose: (label) => `Choose an answer to ${label}.`,
  offList: (label) => `Choose from the options given for ${label}.`,
  tooMany: (label, max) => `Choose at most ${max} for ${label}.`,
};

const emailSchema = z.email();

/** One field's answer and why it fails, or undefined when the post gave a
 * shape the field never asks for. */
function check(
  field: FormField,
  posted: string | string[] | undefined,
  messages: FormFieldMessages,
): { value: string | string[]; error?: string | undefined } | undefined {
  if (field.kind === "choices") {
    const chosen = [
      ...new Set(
        posted === undefined ? [] : Array.isArray(posted) ? posted : [posted],
      ),
    ];
    const offered = new Set(field.options.map((option) => option.value));
    const error = chosen.some((value) => !offered.has(value))
      ? messages.offList(field.label)
      : field.required && chosen.length === 0
        ? messages.choose(field.label)
        : field.max !== undefined && chosen.length > field.max
          ? messages.tooMany(field.label, field.max)
          : undefined;
    return { value: chosen, error };
  }
  if (Array.isArray(posted)) return undefined;
  const value = (posted ?? "").trim();
  if (field.kind === "choice") {
    const error =
      value === ""
        ? field.required
          ? messages.choose(field.label)
          : undefined
        : field.options.some((option) => option.value === value)
          ? undefined
          : messages.offList(field.label);
    return { value, error };
  }
  const error =
    field.required && value === ""
      ? messages.required(field.label)
      : value.length > field.maxLength
        ? messages.tooLong(field.label, field.maxLength)
        : field.kind === "email" &&
            value !== "" &&
            !emailSchema.safeParse(value).success
          ? messages.email(field.label)
          : undefined;
  return { value, error };
}

export function validateAnswers(
  form: FormDefinition,
  posted: Record<string, string | string[]>,
  messages: FormFieldMessages = FORM_FIELD_MESSAGES,
): FormValidation {
  const fields = formFields(form);
  const known = new Set([...RESERVED_FIELD_IDS, ...fields.map((f) => f.id)]);
  if (
    Object.keys(posted).some((key) => !known.has(key)) ||
    (posted["website"] ?? "") !== ""
  )
    return { ok: false, errors: {} };
  const checked = fields.map((field) => ({
    field,
    result: check(field, posted[field.id], messages),
  }));
  if (checked.some(({ result }) => result === undefined))
    return { ok: false, errors: {} };
  const answers: FormAnswers = Object.fromEntries(
    checked.map(({ field, result }) => [field.id, result?.value ?? ""]),
  );
  const errors = Object.fromEntries(
    checked.flatMap(({ field, result }) =>
      result?.error ? [[field.id, result.error]] : [],
    ),
  );
  return Object.keys(errors).length === 0
    ? { ok: true, answers }
    : { ok: false, errors };
}

/** A text answer, or nothing when the field was not answered in text. */
export function answerText(answers: FormAnswers, id: string): string {
  const value = answers[id];
  return typeof value === "string" ? value : "";
}
