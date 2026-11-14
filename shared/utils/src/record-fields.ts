import { isPlainRecord } from "./predicates";

/**
 * Typed reads out of an untyped bag.
 *
 * Entity metadata, job-context payloads and tool results are untyped, so
 * indexing them yields `unknown`. These read a single field and check it,
 * rather than each call site asserting the type it hopes for.
 *
 * The bag itself is checked too: anything that is not a plain object — an
 * array, a string, null, a class instance — reads as holding nothing.
 */

/** The value as a string-keyed bag, or nothing when it is not a plain object. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainRecord(value) ? value : undefined;
}

export function readValue(bag: unknown, key: string): unknown {
  return asRecord(bag)?.[key];
}

export function readString(bag: unknown, key: string): string | undefined {
  const value = readValue(bag, key);
  return typeof value === "string" ? value : undefined;
}

export function readNumber(bag: unknown, key: string): number | undefined {
  const value = readValue(bag, key);
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function readBoolean(bag: unknown, key: string): boolean | undefined {
  const value = readValue(bag, key);
  return typeof value === "boolean" ? value : undefined;
}
