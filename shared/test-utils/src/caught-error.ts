/**
 * Narrow a caught value to `Error`.
 *
 * `catch` binds `unknown`, so `(error as Error).message` asserts exactly what
 * the catch block never checked. When the thrown value is not an Error — a
 * string, a rejected plain object, a framework-wrapped failure — `.message`
 * reads back `undefined`, and `expect(undefined).toContain(...)` is a vacuous
 * pass rather than a caught mistake.
 *
 * This checks instead, and reports what was actually thrown.
 */
export function caughtError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  throw new Error(`Expected an Error to be thrown, but got: ${String(error)}`);
}
