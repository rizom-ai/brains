/**
 * Freeze `value` without widening its type to `Readonly<T>`.
 *
 * `Object.freeze` returns `Readonly<T>`, which TypeScript cannot reconcile with
 * a deferred generic like `z.output<S>` — so call sites that freeze a generic
 * value and return it under its own type otherwise need an assertion. Returning
 * the original binding keeps the declared type and still freezes at runtime.
 */
export function freeze<T>(value: T): T {
  Object.freeze(value);
  return value;
}
