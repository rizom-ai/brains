/**
 * Thrown by a `process.exit` double in place of the process ending.
 *
 * `process.exit` is declared to return `never`, and the only honest way for a
 * stub to satisfy that is to not return either. A stub that returns instead —
 * `undefined as never` — lets the code under test carry on past a point where
 * the real process is gone, so tests exercise paths that cannot happen. In
 * `requireArgValue` the compiler narrows `value` to `string` solely because
 * `process.exit` never returns; under a returning stub that function hands
 * back `undefined` typed as `string`.
 *
 * Throwing keeps the control flow faithful and needs no assertion, since a
 * function whose body always throws already satisfies `never`.
 *
 * @example
 * ```ts
 * const exit = mock((code?: number): never => {
 *   throw new ProcessExited(code);
 * });
 * process.exit = exit;
 *
 * await expectProcessExit(handleCLI(config), 0);
 * ```
 */
export class ProcessExited extends Error {
  public readonly code: number | undefined;

  constructor(code?: number) {
    super(`process.exit(${code ?? 0})`);
    this.name = "ProcessExited";
    this.code = code;
  }
}

/**
 * Assert that `work` ended by calling `process.exit` with `code`.
 *
 * Rethrows anything else, so a genuine failure still surfaces as itself rather
 * than as a missing exit.
 */
export async function expectProcessExit(
  work: Promise<unknown>,
  code: number,
): Promise<void> {
  try {
    await work;
  } catch (error) {
    if (error instanceof ProcessExited) {
      if (error.code !== code) {
        throw new Error(
          `Expected process.exit(${code}), but it exited with ${error.code}`,
          { cause: error },
        );
      }
      return;
    }
    throw error;
  }
  throw new Error(`Expected process.exit(${code}), but it returned normally`);
}
