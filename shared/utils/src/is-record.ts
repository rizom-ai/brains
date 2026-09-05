/**
 * Narrow an `unknown` to an indexable object.
 *
 * Arrays are excluded: `typeof [] === "object"` and `[] !== null`, so a guard
 * written without the array check lets arrays through as records and any
 * subsequent key access silently reads `undefined`.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
