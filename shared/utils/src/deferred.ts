/**
 * A promise with its settlement handed back to the caller.
 *
 * Mostly used to order concurrent work without waiting on a duration: a test
 * that needs one side to be slower gates it on `promise` and calls `resolve`
 * when it is ready, which states the ordering exactly instead of inferring it
 * from a sleep that a loaded machine can invert.
 */
export interface Deferred<T = void> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

export function deferred<T = void>(): Deferred<T> {
  let settle: ((value: T) => void) | undefined;
  let fail: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolveWith, rejectWith) => {
    settle = resolveWith;
    fail = rejectWith;
  });
  return {
    promise,
    resolve: (value: T): void => settle?.(value),
    reject: (reason?: unknown): void => fail?.(reason),
  };
}
