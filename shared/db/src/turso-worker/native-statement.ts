// A statement must release native bindings before its worker can advertise
// reusable resident credit. SDK reset() is not statement finalization.
export class NativeStatementUncertainError extends Error {
  public constructor(cause: unknown) {
    super("Native statement lifecycle could not be confirmed", { cause });
    this.name = "NativeStatementUncertainError";
  }
}
interface StatementResource {
  close: () => void | Promise<void>;
}
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
function failure<T>(
  outcome: Outcome<T>,
  cleanup: unknown,
): NativeStatementUncertainError {
  return new NativeStatementUncertainError(
    outcome.ok
      ? cleanup
      : new AggregateError(
          [outcome.error, cleanup],
          "Statement and resource cleanup failed",
          { cause: cleanup },
        ),
  );
}
function observe(state: () => boolean): boolean {
  try {
    const value = state();
    if (typeof value !== "boolean")
      throw new Error("Invalid native statement transaction state");
    return value;
  } catch (error) {
    throw new NativeStatementUncertainError(error);
  }
}
export async function withNativeStatement<S extends StatementResource, T>(
  state: () => boolean,
  prepare: () => Promise<S>,
  use: (statement: S) => Promise<T>,
): Promise<T> {
  const expected = observe(state);
  const statement = await prepare();
  try {
    if (observe(state) !== expected)
      throw new Error(
        "Native transaction state changed during statement preparation",
      );
  } catch (error) {
    throw new NativeStatementUncertainError(error);
  }
  let outcome: Outcome<T>;
  try {
    outcome = { ok: true, value: await use(statement) };
  } catch (error) {
    outcome = { ok: false, error };
  }
  try {
    if (observe(state) !== expected)
      throw new Error(
        "Native transaction state changed during statement execution",
      );
  } catch (error) {
    // No additional native cleanup after observed transaction loss/unreadability.
    // The parent retains uncertain-owner reservations until worker exit.
    throw failure(outcome, error);
  }
  try {
    await statement.close();
  } catch (error) {
    throw failure(outcome, error);
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
