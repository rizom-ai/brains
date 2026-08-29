import { z } from "@brains/utils/zod";
import { parseWithSchema } from "@brains/utils/parse-schema";
import { freeze } from "@brains/utils/freeze";
import type {
  AccountSettingsValue,
  AnyAccountSettingsDefinition,
} from "./account-settings-definition-contract";

export type AccountSettingsScalar = string | number | boolean | null;
export type AccountSettingsStoredValues = Readonly<
  Record<string, AccountSettingsScalar>
>;

export interface AccountSettingsStorageIdentity {
  readonly packageName: string;
  readonly definitionId: string;
  readonly actorId: string;
}

export interface StoredAccountSettings {
  readonly values: AccountSettingsStoredValues;
  readonly revision: number;
}

export interface AccountSettingsBackend {
  read(
    identity: AccountSettingsStorageIdentity,
  ): Promise<StoredAccountSettings | null>;
  list(input: {
    readonly packageName: string;
    readonly definitionId: string;
  }): Promise<
    readonly {
      readonly actorId: string;
      readonly values: AccountSettingsStoredValues;
      readonly revision: number;
    }[]
  >;
  write(
    identity: AccountSettingsStorageIdentity,
    values: AccountSettingsStoredValues,
  ): Promise<StoredAccountSettings>;
  delete(identity: AccountSettingsStorageIdentity): Promise<boolean>;
  deleteActor(actorId: string): Promise<number>;
}

export interface AccountSettingsRegistration<
  TDefinition extends AnyAccountSettingsDefinition =
    AnyAccountSettingsDefinition,
> {
  readonly id: string;
  readonly ownerPluginId: string;
  readonly packageName: string;
  readonly definitionId: string;
  readonly definition: TDefinition;
}

export interface AccountSettingsFormField {
  readonly name: string;
  readonly label: string;
  readonly control: "text" | "url" | "number" | "checkbox";
  readonly secret: boolean;
  readonly required: boolean;
  readonly value?: AccountSettingsScalar | undefined;
  readonly set?: boolean | undefined;
}

export interface AccountSettingsForm {
  readonly id: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly configured: boolean;
  /** Opaque change token for host form reset; never contains stored values. */
  readonly revision: number | null;
  readonly fields: readonly AccountSettingsFormField[];
}

export interface ConfiguredAccountSettings<
  TDefinition extends AnyAccountSettingsDefinition =
    AnyAccountSettingsDefinition,
> {
  readonly id: string;
  readonly settings: AccountSettingsValue<TDefinition>;
  readonly revision: number;
}

export interface RegisterAccountSettingsInput<
  TDefinition extends AnyAccountSettingsDefinition =
    AnyAccountSettingsDefinition,
> {
  readonly ownerPluginId: string;
  readonly packageName: string;
  readonly definitionId: string;
  readonly definition: TDefinition;
}

export type AccountSettingsChangeListener = () => void;

const accountSettingsScalarSchema: z.ZodType<AccountSettingsScalar> = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

function registrationId(packageName: string, definitionId: string): string {
  return Buffer.from(JSON.stringify([packageName, definitionId])).toString(
    "base64url",
  );
}

function identityFor(
  registration: AccountSettingsRegistration,
  actorId: string,
): AccountSettingsStorageIdentity {
  return {
    packageName: registration.packageName,
    definitionId: registration.definitionId,
    actorId,
  };
}

function labelFromName(name: string): string {
  const label = name
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[-_]+/g, " ")
    .trim();
  return label ? `${label[0]?.toUpperCase() ?? ""}${label.slice(1)}` : name;
}

function schemaShape(definition: AnyAccountSettingsDefinition): z.ZodRawShape {
  return definition.schema.shape;
}

function parseUndefined(
  schema: unknown,
):
  | { readonly success: true; readonly data: unknown }
  | { readonly success: false } {
  const safeParse: unknown =
    schema !== null && typeof schema === "object"
      ? Reflect.get(schema, "safeParse")
      : undefined;
  if (typeof safeParse !== "function") return { success: false };
  const result: unknown = safeParse.call(schema, undefined);
  if (
    result !== null &&
    typeof result === "object" &&
    Reflect.get(result, "success") === true
  ) {
    return { success: true, data: Reflect.get(result, "data") };
  }
  return { success: false };
}

function defaultScalar(schema: unknown): AccountSettingsScalar | undefined {
  const parsed = parseUndefined(schema);
  if (!parsed.success) return undefined;
  const scalar = accountSettingsScalarSchema.safeParse(parsed.data);
  return scalar.success ? scalar.data : undefined;
}

function storableValues(
  definition: AnyAccountSettingsDefinition,
  parsed: object,
): AccountSettingsStoredValues {
  const values: Record<string, AccountSettingsScalar> = {};
  for (const name of Object.keys(schemaShape(definition))) {
    const value: unknown = Reflect.get(parsed, name);
    if (value !== undefined) {
      values[name] = accountSettingsScalarSchema.parse(value);
    }
  }
  return Object.freeze(values);
}

function sameValues(
  left: AccountSettingsStoredValues,
  right: AccountSettingsStoredValues,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(
      ([name, value]) =>
        Object.hasOwn(right, name) && Object.is(value, right[name]),
    )
  );
}

/** App-scoped definition catalog and guarded access to the auth-owned backend. */
export class AccountSettingsRegistry {
  private readonly registrations = new Map<
    string,
    AccountSettingsRegistration
  >();
  private readonly listeners = new Map<
    string,
    Set<AccountSettingsChangeListener>
  >();
  private readonly mutationTails = new Map<string, Promise<void>>();
  private backend: AccountSettingsBackend | undefined;

  register<TDefinition extends AnyAccountSettingsDefinition>(
    input: RegisterAccountSettingsInput<TDefinition>,
  ): AccountSettingsRegistration<TDefinition> {
    if (!input.ownerPluginId.trim()) {
      throw new Error("Account settings owner plugin id must not be empty");
    }
    if (!input.packageName.trim()) {
      throw new Error("Account settings package name must not be empty");
    }
    if (!input.definitionId.trim()) {
      throw new Error("Account settings definition id must not be empty");
    }

    const id = registrationId(input.packageName, input.definitionId);
    const existing = this.registrations.get(id);
    if (existing) {
      if (
        existing.ownerPluginId === input.ownerPluginId &&
        existing.definition === input.definition
      ) {
        return existing as AccountSettingsRegistration<TDefinition>;
      }
      throw new Error(
        `Account settings definition "${input.packageName}:${input.definitionId}" is already registered`,
      );
    }

    const registration = Object.freeze({ id, ...input });
    this.registrations.set(id, registration);
    return registration;
  }

  unregister(registration: AccountSettingsRegistration): void {
    if (this.registrations.get(registration.id) !== registration) return;
    this.registrations.delete(registration.id);
    this.listeners.delete(registration.id);
  }

  bindBackend(backend: AccountSettingsBackend): () => void {
    if (this.backend && this.backend !== backend) {
      throw new Error("Account settings backend is already bound");
    }
    this.backend = backend;
    for (const registration of this.registrations.values()) {
      this.notify(registration.id);
    }
    let active = true;
    return (): void => {
      if (!active) return;
      active = false;
      if (this.backend === backend) this.backend = undefined;
    };
  }

  hasRegistrations(): boolean {
    return this.registrations.size > 0;
  }

  hasBackend(): boolean {
    return this.backend !== undefined;
  }

  listRegistrations(): readonly AccountSettingsRegistration[] {
    return [...this.registrations.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  }

  async listForms(actorId: string): Promise<readonly AccountSettingsForm[]> {
    const forms: AccountSettingsForm[] = [];
    for (const registration of this.listRegistrations()) {
      const stored = await this.requireBackend(registration).read(
        identityFor(registration, actorId),
      );
      forms.push(this.formFor(registration, stored));
    }
    return forms;
  }

  async save(
    registrationIdValue: string,
    actorId: string,
    input: Readonly<Record<string, unknown>>,
  ): Promise<AccountSettingsForm> {
    const registration = this.requireRegistration(registrationIdValue);
    return this.serializeMutation(
      `${registration.id}:${actorId}`,
      async (): Promise<AccountSettingsForm> => {
        const backend = this.requireBackend(registration);
        const identity = identityFor(registration, actorId);
        const current = await backend.read(identity);
        const shape = schemaShape(registration.definition);
        const unknownField = Object.keys(input).find(
          (name) => !Object.hasOwn(shape, name),
        );
        if (unknownField) {
          throw new Error(
            `Account settings field "${unknownField}" is not declared by "${registration.packageName}:${registration.definitionId}"`,
          );
        }

        const candidate: Record<string, unknown> = {};
        for (const name of Object.keys(shape)) {
          const secret = registration.definition.fields[name]?.secret === true;
          if (!Object.hasOwn(input, name)) {
            if (secret && current?.values[name] !== undefined) {
              candidate[name] = current.values[name];
            }
            continue;
          }
          const value = input[name];
          if (secret && (value === "" || value === undefined)) {
            if (current?.values[name] !== undefined) {
              candidate[name] = current.values[name];
            }
            continue;
          }
          if (value !== undefined) candidate[name] = value;
        }

        const parsed = registration.definition.schema.parse(candidate);
        const values = storableValues(registration.definition, parsed);
        const stored =
          current && sameValues(current.values, values)
            ? current
            : await backend.write(identity, values);
        if (stored !== current) this.notify(registration.id);
        return this.formFor(registration, stored);
      },
    );
  }

  async delete(registrationIdValue: string, actorId: string): Promise<boolean> {
    const registration = this.requireRegistration(registrationIdValue);
    return this.serializeMutation(
      `${registration.id}:${actorId}`,
      async (): Promise<boolean> => {
        const deleted = await this.requireBackend(registration).delete(
          identityFor(registration, actorId),
        );
        if (deleted) this.notify(registration.id);
        return deleted;
      },
    );
  }

  async deleteActor(actorId: string): Promise<number> {
    const backend = this.backend;
    const deleted = backend ? await backend.deleteActor(actorId) : 0;
    this.refreshActor(actorId);
    return deleted;
  }

  /** Notify account-bound supervisors after auth-owned cascade deletion. */
  accountDeleted(actorId: string): void {
    this.refreshActor(actorId);
  }

  private refreshActor(_actorId: string): void {
    for (const registration of this.registrations.values()) {
      this.notify(registration.id);
    }
  }

  async getForActor<TDefinition extends AnyAccountSettingsDefinition>(
    registration: AccountSettingsRegistration<TDefinition>,
    actorId: string,
  ): Promise<AccountSettingsValue<TDefinition> | null> {
    this.requireAttached(registration);
    const stored = await this.requireBackend(registration).read(
      identityFor(registration, actorId),
    );
    return stored
      ? freeze(
          parseWithSchema<TDefinition["schema"]>(
            registration.definition.schema,
            stored.values,
          ),
        )
      : null;
  }

  async listConfigured<TDefinition extends AnyAccountSettingsDefinition>(
    registration: AccountSettingsRegistration<TDefinition>,
  ): Promise<readonly ConfiguredAccountSettings<TDefinition>[]> {
    this.requireAttached(registration);
    const records = await this.requireBackend(registration).list({
      packageName: registration.packageName,
      definitionId: registration.definitionId,
    });
    return records.map((record) =>
      Object.freeze({
        id: record.actorId,
        settings: freeze(
          parseWithSchema<TDefinition["schema"]>(
            registration.definition.schema,
            record.values,
          ),
        ),
        revision: record.revision,
      }),
    );
  }

  subscribe(
    registration: AccountSettingsRegistration,
    listener: AccountSettingsChangeListener,
  ): () => void {
    this.requireAttached(registration);
    const listeners = this.listeners.get(registration.id) ?? new Set();
    listeners.add(listener);
    this.listeners.set(registration.id, listeners);
    return (): void => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(registration.id);
    };
  }

  private formFor(
    registration: AccountSettingsRegistration,
    stored: StoredAccountSettings | null,
  ): AccountSettingsForm {
    const fields = Object.entries(schemaShape(registration.definition)).map(
      ([name, schema]): AccountSettingsFormField => {
        const metadata = registration.definition.fields[name];
        const secret = metadata?.secret === true;
        const storedValue = stored?.values[name];
        const value =
          storedValue !== undefined ? storedValue : defaultScalar(schema);
        return Object.freeze({
          name,
          label: metadata?.label ?? labelFromName(name),
          control: metadata?.control ?? "text",
          secret,
          required: !parseUndefined(schema).success,
          ...(secret
            ? { set: storedValue !== undefined }
            : value !== undefined
              ? { value }
              : {}),
        });
      },
    );
    return Object.freeze({
      id: registration.id,
      title: registration.definition.title,
      ...(registration.definition.description
        ? { description: registration.definition.description }
        : {}),
      configured: stored !== null,
      revision: stored?.revision ?? null,
      fields: Object.freeze(fields),
    });
  }

  private requireRegistration(id: string): AccountSettingsRegistration {
    const registration = this.registrations.get(id);
    if (!registration) throw new Error("Account settings definition not found");
    return registration;
  }

  private requireAttached(registration: AccountSettingsRegistration): void {
    if (this.registrations.get(registration.id) !== registration) {
      throw new Error("Account settings definition is not registered");
    }
  }

  private requireBackend(
    registration: AccountSettingsRegistration,
  ): AccountSettingsBackend {
    if (!this.backend) {
      throw new Error(
        `Account settings runtime is unavailable for "${registration.packageName}:${registration.definitionId}"`,
      );
    }
    return this.backend;
  }

  private notify(registrationIdValue: string): void {
    for (const listener of this.listeners.get(registrationIdValue) ?? []) {
      listener();
    }
  }

  private serializeMutation<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.mutationTails.get(key) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.mutationTails.set(key, settled);
    void settled.finally(() => {
      if (this.mutationTails.get(key) === settled) {
        this.mutationTails.delete(key);
      }
    });
    return result;
  }
}
