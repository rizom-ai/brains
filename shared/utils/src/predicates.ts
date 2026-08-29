/**
 * Shared runtime type predicates.
 *
 * These exist so callers can narrow values the compiler cannot narrow on its
 * own, instead of asserting a type the compiler never verifies.
 */

/**
 * `Object.getPrototypeOf` is declared to return `any`, which silently poisons
 * anything compared against it. Binding it to a typed signature restores the
 * check without an assertion at each call site.
 */
const getPrototypeOf: (value: object) => object | null = Object.getPrototypeOf;

/**
 * True for objects produced by object literals, `JSON.parse`, or
 * `Object.create(null)` — i.e. things safe to treat as a string-keyed bag.
 * False for arrays, class instances, and exotic built-ins like Date or Map.
 */
export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** An `Error` carrying a syscall-style string `code`, verified at runtime. */
export interface ErrnoLikeError extends Error {
  code: string;
}

/**
 * True for the Node errors whose `code` callers branch on (`ENOENT` and
 * friends). Unlike asserting `NodeJS.ErrnoException`, this rejects thrown
 * strings, DOMExceptions, and errors with no code at all.
 */
export function isErrnoException(value: unknown): value is ErrnoLikeError {
  return (
    value instanceof Error && "code" in value && typeof value.code === "string"
  );
}
