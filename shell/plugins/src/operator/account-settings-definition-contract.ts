import type { z } from "@brains/utils/zod";

export type AccountSettingsSchema = z.ZodObject<z.ZodRawShape>;

export type AccountSettingsControl = "text" | "url" | "number" | "checkbox";

export interface AccountSettingsFieldDefinition {
  readonly label: string;
  readonly control?: AccountSettingsControl | undefined;
  readonly secret?: boolean | undefined;
}

export type AccountSettingsFieldMap<TSchema extends AccountSettingsSchema> = {
  readonly [
    K in Extract<keyof z.input<TSchema>, string>
  ]?: AccountSettingsFieldDefinition;
};

export interface AccountSettingsDefinition<
  TSchema extends AccountSettingsSchema = AccountSettingsSchema,
  TFields extends AccountSettingsFieldMap<TSchema> =
    AccountSettingsFieldMap<TSchema>,
> {
  readonly kind: "rizom-account-settings";
  readonly title: string;
  readonly description?: string | undefined;
  readonly schema: TSchema;
  readonly fields: TFields;
}

export type AnyAccountSettingsDefinition = AccountSettingsDefinition<
  AccountSettingsSchema,
  AccountSettingsFieldMap<AccountSettingsSchema>
>;

export type AccountSettingsValue<
  TDefinition extends AnyAccountSettingsDefinition,
> = z.output<TDefinition["schema"]>;

export function defineAccountSettings<
  TSchema extends AccountSettingsSchema,
  const TFields extends AccountSettingsFieldMap<TSchema>,
>(definition: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly schema: TSchema;
  readonly fields: TFields;
}): AccountSettingsDefinition<TSchema, TFields> {
  if (!definition.title.trim()) {
    throw new Error("Account settings title must not be empty");
  }
  if (definition.description !== undefined && !definition.description.trim()) {
    throw new Error("Account settings description must not be empty");
  }

  const schemaFields = new Set(Object.keys(definition.schema.shape));
  const controls = new Set<AccountSettingsControl>([
    "text",
    "url",
    "number",
    "checkbox",
  ]);
  for (const [name, field] of Object.entries(definition.fields)) {
    if (!field) continue;
    if (!schemaFields.has(name)) {
      throw new Error(
        `Account settings field "${name}" is not declared by the settings schema`,
      );
    }
    if (!field.label.trim()) {
      throw new Error(
        `Account settings field "${name}" label must not be empty`,
      );
    }
    if (field.control !== undefined && !controls.has(field.control)) {
      throw new Error(
        `Account settings field "${name}" has unsupported control "${String(field.control)}"`,
      );
    }
    if (field.secret !== undefined && typeof field.secret !== "boolean") {
      throw new Error(
        `Account settings field "${name}" secret must be boolean`,
      );
    }
  }

  const fields = Object.freeze(
    Object.fromEntries(
      Object.entries(definition.fields).map(([name, field]) => [
        name,
        field ? Object.freeze({ ...field }) : field,
      ]),
    ),
  ) as TFields;

  return Object.freeze({
    kind: "rizom-account-settings",
    ...definition,
    fields,
  });
}
