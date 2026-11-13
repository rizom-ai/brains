import type { z } from "@brains/utils/zod";

/**
 * A runtime-state record its owner shares with other packages: named
 * `<package name>:<name>`, as an answered channel is, and validated by its
 * schema on every write and read. Only the owner writes it, through its
 * `setup`'s `runtimeState`; any data source reads it. A namespace the owner
 * keeps through `runtimeState({ namespace })` stays private to the owner.
 */
export interface SharedState<TValue, TInput = TValue> {
  readonly kind: "rizom-shared-state";
  readonly name: string;
  readonly schema: z.ZodType<TValue, TInput>;
}

const sharedStateName = /^[^\s:]+:[^\s:]+$/u;

/** Declare a runtime-state record the package named in `name` shares. */
export function defineSharedState<TValue, TInput = TValue>(
  name: `${string}:${string}`,
  schema: z.ZodType<TValue, TInput>,
): SharedState<TValue, TInput> {
  if (!sharedStateName.test(name)) {
    throw new Error(
      `Shared state "${name}" is named "<package name>:<name>", with no spaces and one colon`,
    );
  }
  return Object.freeze({ kind: "rizom-shared-state", name, schema });
}

/** Whether a value is a shared-state declaration. */
export function isSharedState(
  value: unknown,
): value is SharedState<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "rizom-shared-state"
  );
}

/**
 * Where a shared record is stored. The `shared:` tag and the base64url name
 * can alias no package's private namespace, which is `scope.name.local` or
 * tagged `package:`.
 */
export function sharedStateNamespace(name: string): string {
  return `shared:${Buffer.from(name).toString("base64url")}`;
}

/** Refuse a shared state the package does not own. */
export function assertSharedStateOwner(
  state: SharedState<unknown, unknown>,
  packageName: string,
): void {
  if (!state.name.startsWith(`${packageName}:`)) {
    throw new Error(
      `Package "${packageName}" writes only shared state named "${packageName}:<name>", and "${state.name}" is not one`,
    );
  }
}
