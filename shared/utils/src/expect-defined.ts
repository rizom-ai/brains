/**
 * Assert a value is present and return it narrowed.
 *
 * Exists so tests can drop optional chaining from their assertions. Written
 * as `expect(subject?.field).toBeUndefined()`, an assertion also passes when
 * `subject` itself is missing — the test goes green for the wrong reason and
 * stops guarding anything. `expect(expectDefined(subject).field)` fails on the
 * missing subject instead, and names it.
 *
 * @param value - the possibly-absent subject
 * @param label - what was expected, for the failure message
 */
export function expectDefined<T>(
  value: T | null | undefined,
  label = "a value",
): T {
  if (value === undefined) {
    throw new Error(`Expected ${label}, got undefined`);
  }
  if (value === null) {
    throw new Error(`Expected ${label}, got null`);
  }
  return value;
}
