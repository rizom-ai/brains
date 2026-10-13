import { z } from "./zod";

const recordSchema = z.record(z.string(), z.unknown());

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return recordSchema.safeParse(value).success;
}

/**
 * Merge explicit configuration over defaults before serialization or validation.
 *
 * Runtime resolution deletes keys overridden with null by default. Intermediate
 * configuration documents preserve those markers for the runtime to apply.
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
  options: { nulls?: "delete" | "preserve" } = {},
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const overrideVal = override[key];
    if (overrideVal === null && options.nulls !== "preserve") {
      delete result[key];
    } else if (isPlainObject(result[key]) && isPlainObject(overrideVal)) {
      result[key] = deepMerge(result[key], overrideVal, options);
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}
