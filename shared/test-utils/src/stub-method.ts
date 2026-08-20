/**
 * Replace one method on a mock with a stub of the same type.
 *
 * Written by hand, this is `target.method = (loose, args) => {...} as typeof
 * target.method` — and the cast is the whole problem: it asserts the stub
 * matches instead of checking it, so a stub that drifts from the real
 * signature keeps compiling and starts lying. Here the implementation is
 * contextually typed from the method it replaces, which makes the wrong
 * shape a type error and the assertion unnecessary.
 */
export function stubMethod<TTarget, TKey extends keyof TTarget>(
  target: TTarget,
  key: TKey,
  implementation: TTarget[TKey],
): void {
  target[key] = implementation;
}
