import { z } from "@brains/utils/zod";

const recordSchema = z.record(z.string(), z.unknown());

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return recordSchema.safeParse(value).success;
}

/**
 * Merge a brain.yaml override over a brain-model default.
 *
 * A `null` in the override deletes the key rather than setting it to null,
 * which is how an instance turns off something its model switched on.
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const overrideVal = override[key];
    if (overrideVal === null) {
      delete result[key];
    } else if (isPlainObject(result[key]) && isPlainObject(overrideVal)) {
      result[key] = deepMerge(result[key], overrideVal);
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}
