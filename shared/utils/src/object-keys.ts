/**
 * Key-preserving wrappers around `Object.keys` / `Object.entries`.
 *
 * These are deliberately unsound, in exactly one place. `Object.keys` returns
 * `string[]` and `Object.entries` returns `[string, T[keyof T]][]` by design:
 * at runtime an object may carry keys beyond those in its declared type
 * (inherited members, extra properties surviving a structural assignment), so
 * TypeScript refuses to promise `keyof T`.
 *
 * Callers that iterate a closed, locally-declared record still want the key
 * type. Rather than each of them asserting it, the assertion lives here — and
 * so does the caveat: only use these on records you own and know to be exact.
 * For anything parsed, received over the wire, or widened through an index
 * signature, validate instead.
 */

export function objectKeys<T extends object>(value: T): (keyof T & string)[] {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Object.keys is typed string[] because of prototype-chain keys; for a plain object the keys are exactly keyof T, and this helper is the one place that says so
  return Object.keys(value) as (keyof T & string)[];
}

export function objectEntries<T extends object>(
  value: T,
): [keyof T & string, T[keyof T]][] {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- same Object.entries widening as objectKeys above
  return Object.entries(value) as [keyof T & string, T[keyof T]][];
}

/**
 * Narrow an arbitrary string to a key of `record`, verified at runtime.
 *
 * Unlike the two above this one is sound: the `in` check actually runs. Use it
 * for lookups keyed by untrusted input.
 */
export function isKeyOf<T extends object>(
  record: T,
  key: PropertyKey,
): key is keyof T {
  return key in record;
}
