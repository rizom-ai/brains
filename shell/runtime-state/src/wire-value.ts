import type { RuntimeStateValueSchema } from "./types";

/** Validate what storage will read, but persist input rather than transformed output. */
export function prepareRuntimeStateValue<T, TInput>(
  schema: RuntimeStateValueSchema<T, TInput>,
  value: TInput,
): unknown {
  const serialized = JSON.stringify(value);
  if (!serialized) {
    throw new Error("Runtime state must be a JSON wire value");
  }
  const wireValue: unknown = JSON.parse(serialized);
  schema.parse(wireValue);
  return wireValue;
}
