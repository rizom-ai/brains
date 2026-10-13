import type { AuthAccountPluginSettingsField } from "@brains/auth-service/account-contracts";

/**
 * A settings form's values in the types its fields declare: a checkbox is
 * whether it was ticked, and a filled number field is a number.
 */
export function settingsFormValues(
  fields: readonly AuthAccountPluginSettingsField[],
  formData: FormData,
): Record<string, unknown> {
  const values: Record<string, unknown> = Object.fromEntries(
    formData.entries(),
  );
  for (const field of fields) {
    if (field.control === "checkbox") {
      values[field.name] = formData.has(field.name);
    } else if (
      field.control === "number" &&
      typeof values[field.name] === "string" &&
      values[field.name] !== ""
    ) {
      values[field.name] = Number(values[field.name]);
    }
  }
  return values;
}

/** The input a settings field renders as; a secret never shows its text. */
export function settingInputType(
  field: AuthAccountPluginSettingsField,
): "password" | "url" | "number" | "text" {
  if (field.secret) return "password";
  if (field.control === "url" || field.control === "number")
    return field.control;
  return "text";
}
