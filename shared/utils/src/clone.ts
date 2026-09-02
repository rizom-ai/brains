import { isPlainRecord } from "./predicates";

function cloneUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneUnknown(item));
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneUnknown(item)]),
    );
  }

  // Dates, class instances, functions: copied by reference, as callers rely on.
  return value;
}

/**
 * Deep-copy plain data (records and arrays), passing anything else through by
 * reference.
 *
 * The single assertion below is irreducible: a homomorphic deep clone cannot be
 * expressed in TypeScript, because the compiler cannot prove that mapping over
 * `T & unknown[]`, or rebuilding a record via `Object.fromEntries`, reproduces
 * `T`. Isolating it here keeps that one unchecked step in a tested place
 * instead of repeating it at each call site.
 */
export function clonePlainData<T>(value: T): T {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- cloneUnknown walks and rebuilds the value, so the copy has the input shape by construction; the single proof point lives here so call sites need none
  return cloneUnknown(value) as T;
}
