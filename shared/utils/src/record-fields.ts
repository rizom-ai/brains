/**
 * Typed reads out of an untyped bag.
 *
 * Entity metadata and job-context payloads are `Record<string, unknown>`, so
 * indexing them yields `unknown`. These read a single field and check it,
 * rather than each call site asserting the type it hopes for.
 */

/** Null and undefined are accepted: metadata bags are frequently optional. */
type Bag = Record<string, unknown> | null | undefined;

export function readString(bag: Bag, key: string): string | undefined {
  const value = bag?.[key];
  return typeof value === "string" ? value : undefined;
}

export function readNumber(bag: Bag, key: string): number | undefined {
  const value = bag?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
