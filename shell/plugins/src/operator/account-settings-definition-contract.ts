import type { z } from "@brains/utils/zod";
import { assertOptionalText, assertText } from "./contract-assertions";

export type AccountSettingsSchema = z.ZodObject<z.ZodRawShape>;

export type AccountSettingsControl = "text" | "url" | "number" | "checkbox";

export interface AccountSettingsFieldDefinition {
  readonly label: string;
  readonly control?: AccountSettingsControl | undefined;
  readonly secret?: boolean | undefined;
}

/**
 * Every schema field must be declared. Totality is what makes `secret` a
 * decision rather than an omission: a missing entry would otherwise render a
 * credential as an ordinary echoing text input.
 */
export type AccountSettingsFieldMap<TSchema extends AccountSettingsSchema> = {
  readonly [
    K in Extract<keyof z.input<TSchema>, string>
  ]: AccountSettingsFieldDefinition;
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

/** Field names the author declared `secret: true`. */
export type SecretSettingsKeys<
  TDefinition extends AnyAccountSettingsDefinition,
> = {
  [K in keyof TDefinition["fields"]]: NonNullable<
    TDefinition["fields"][K]
  > extends {
    readonly secret: true;
  }
    ? K
    : never;
}[keyof TDefinition["fields"]];

/**
 * Settings as an operator callback sees them. Widget, workspace, and action
 * data is serialized to the browser, so secret fields are removed from the type
 * itself: reading one is a compile error rather than a review question. Full
 * values stay available to server-only paths such as account-bound daemons.
 */
export type RedactedAccountSettingsValue<
  TDefinition extends AnyAccountSettingsDefinition,
> = Omit<
  AccountSettingsValue<TDefinition>,
  Extract<SecretSettingsKeys<TDefinition>, string>
>;

export function defineAccountSettings<
  TSchema extends AccountSettingsSchema,
  const TFields extends AccountSettingsFieldMap<TSchema>,
>(definition: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly schema: TSchema;
  readonly fields: TFields;
}): AccountSettingsDefinition<TSchema, TFields> {
  assertText(definition.title, "Account settings title");
  assertOptionalText(definition.description, "Account settings description");

  const schemaFields = Object.keys(definition.schema.shape);
  const declared = new Set(Object.keys(definition.fields));
  const controls = new Set<AccountSettingsControl>([
    "text",
    "url",
    "number",
    "checkbox",
  ]);
  for (const [name, field] of Object.entries(definition.fields)) {
    if (!schemaFields.includes(name)) {
      throw new Error(
        `Account settings field "${name}" is not declared by the settings schema`,
      );
    }
    assertText(field.label, `Account settings field "${name}" label`);
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
  for (const name of schemaFields) {
    if (!declared.has(name)) {
      throw new Error(
        `Account settings schema field "${name}" has no field declaration; declare its label and whether it is secret`,
      );
    }
  }

  const fields = Object.freeze(
    Object.fromEntries(
      Object.entries(definition.fields).map(([name, field]) => [
        name,
        Object.freeze({ ...field }),
      ]),
    ),
  ) as TFields;

  return Object.freeze({
    kind: "rizom-account-settings",
    ...definition,
    fields,
  });
}
