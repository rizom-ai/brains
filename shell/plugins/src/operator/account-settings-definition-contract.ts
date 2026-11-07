import type { z } from "@brains/utils/zod";
import { assertOptionalText, assertText } from "./contract-assertions";
import {
  accountSettingsControlSchema,
  type AccountSettingsControl,
  type OperatorFieldDefinitionBase,
} from "./operator-field-contract";

export type AccountSettingsSchema = z.ZodObject<z.ZodRawShape>;
export type { AccountSettingsControl } from "./operator-field-contract";

export interface AccountSettingsFieldDefinition extends Omit<
  OperatorFieldDefinitionBase<AccountSettingsControl>,
  "control"
> {
  readonly control?: AccountSettingsControl | undefined;
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
/** Keep the no-settings case as `never`; `Omit<never, K>` widens to `{}`. */
type PreserveNever<T> = T extends unknown ? unknown : never;

export type RedactedAccountSettingsValue<
  TDefinition extends AnyAccountSettingsDefinition,
> = Omit<
  AccountSettingsValue<TDefinition>,
  Extract<SecretSettingsKeys<TDefinition>, string>
> &
  PreserveNever<TDefinition>;

/**
 * A secret setting as the package reads it: opaque until revealed. It
 * serializes, prints and interpolates as a redacted marker, so a secret placed
 * by accident in view data, a route answer, a tool result or a log line leaves
 * as the marker, never the value.
 */
export interface AccountSettingsSecret<TValue = string> {
  /** The value itself, for the server-side call that needs it. */
  reveal(): TValue;
  /** The redacted marker. */
  toJSON(): string;
  /** The redacted marker. */
  toString(): string;
}

/** What a secret serializes, prints and interpolates as. */
export const ACCOUNT_SETTINGS_SECRET_MARKER = "[secret]";

const inspectCustom = Symbol.for("nodejs.util.inspect.custom");

/** A sealed secret; its value is reachable only through `reveal()`. */
class SealedAccountSettingsSecret<
  TValue,
> implements AccountSettingsSecret<TValue> {
  readonly #value: TValue;

  constructor(value: TValue) {
    this.#value = value;
    // Console and inspector output, as well as serialization, print the
    // marker; the key is not a declared member, so it is set here.
    Object.defineProperty(this, inspectCustom, {
      value: (): string => ACCOUNT_SETTINGS_SECRET_MARKER,
    });
    Object.freeze(this);
  }

  reveal(): TValue {
    return this.#value;
  }

  toJSON(): string {
    return ACCOUNT_SETTINGS_SECRET_MARKER;
  }

  toString(): string {
    return ACCOUNT_SETTINGS_SECRET_MARKER;
  }

  [Symbol.toPrimitive](): string {
    return ACCOUNT_SETTINGS_SECRET_MARKER;
  }
}

/**
 * Settings as the package reads them for its own server-side use: every
 * field, and each the definition marks `secret` sealed until revealed.
 */
export type SealedAccountSettingsValue<
  TDefinition extends AnyAccountSettingsDefinition,
> = {
  readonly [
    K in keyof AccountSettingsValue<TDefinition>
  ]: K extends SecretSettingsKeys<TDefinition>
    ? AccountSettingsSecret<
        Exclude<AccountSettingsValue<TDefinition>[K], undefined>
      >
    : AccountSettingsValue<TDefinition>[K];
} & PreserveNever<TDefinition>;

/** Seals every field the definition marks secret. */
export function sealAccountSettings<
  TDefinition extends AnyAccountSettingsDefinition,
>(
  definition: TDefinition,
  values: AccountSettingsValue<TDefinition>,
): SealedAccountSettingsValue<TDefinition>;
export function sealAccountSettings(
  definition: AnyAccountSettingsDefinition,
  values: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(values).map(([name, value]) => [
        name,
        definition.fields[name]?.secret === true && value !== undefined
          ? new SealedAccountSettingsSecret(value)
          : value,
      ]),
    ),
  );
}

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
  for (const [name, field] of Object.entries(definition.fields)) {
    if (!schemaFields.includes(name)) {
      throw new Error(
        `Account settings field "${name}" is not declared by the settings schema`,
      );
    }
    assertText(field.label, `Account settings field "${name}" label`);
    if (
      field.control !== undefined &&
      !accountSettingsControlSchema.safeParse(field.control).success
    ) {
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

  // Frozen in place rather than rebuilt: Object.fromEntries returns
  // { [k: string]: V }, dropping the key-to-field mapping TFields carries, and
  // the result then had to be asserted back to it. `definition.fields` is
  // already TFields, and the definition it belongs to is frozen here anyway.
  const fields = definition.fields;
  for (const field of Object.values(fields)) {
    Object.freeze(field);
  }
  Object.freeze(fields);

  return Object.freeze({
    kind: "rizom-account-settings",
    ...definition,
    fields,
  });
}

/**
 * Writes this package's own account settings, through the definition its
 * header declares, for one account the runtime vouches for; the package never
 * names an account. Values are checked by the definition's schema, and a
 * refused one is named by its field alone.
 */
/** Reads the package's own account settings for the current caller's account. */
export interface AccountSettingsReader<
  TSettings extends AnyAccountSettingsDefinition,
> {
  /**
   * The current caller's own settings, each secret field sealed until
   * revealed; `null` for a caller without an account, or one who has none.
   */
  read(
    ...declared: [TSettings] extends [never] ? [never] : []
  ): Promise<SealedAccountSettingsValue<TSettings> | null>;
}

export interface ServiceAccountSettings<
  TSettings extends AnyAccountSettingsDefinition,
> extends AccountSettingsReader<TSettings> {
  /** Writes the settings of the current caller's own account. */
  save(values: z.input<TSettings["schema"]>): Promise<void>;
  /**
   * A single-use, short-lived state naming the current caller's account and,
   * when the caller came through a browser session, that session's account.
   */
  claim(
    ...declared: [TSettings] extends [never] ? [never] : []
  ): Promise<string>;
  /**
   * Consumes a claim, then writes what `produce` returns for the account it
   * names. A claim made through a browser session is redeemed only from a
   * session of the same account. A refused claim is refused before
   * `produce` runs; if `produce` fails, nothing is written and the claim
   * stays used.
   */
  redeem(
    state: string,
    produce: () =>
      z.input<TSettings["schema"]> | Promise<z.input<TSettings["schema"]>>,
  ): Promise<void>;
}
