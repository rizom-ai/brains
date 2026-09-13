/** Returned by a step whose compare-and-set lost to a concurrent writer. */
export const retry: unique symbol = Symbol("retry");

/**
 * Runs `step` until it returns something other than `retry`, at most `attempts`
 * times, then yields `exhausted()`. Step errors propagate to the caller, which
 * decides whether an ambiguous write must stay reserved.
 */
export async function attempt<T>(
  attempts: number,
  step: () => Promise<T | typeof retry>,
  exhausted: () => T,
): Promise<T> {
  if (attempts <= 0) return exhausted();
  const result = await step();
  return result === retry ? attempt(attempts - 1, step, exhausted) : result;
}
