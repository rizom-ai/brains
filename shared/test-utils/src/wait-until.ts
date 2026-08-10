export interface WaitUntilOptions {
  /** Give up after this long. Default 2000ms. */
  timeoutMs?: number;
  /** Gap between attempts. Default 10ms. */
  intervalMs?: number;
}

/**
 * Wait for a condition instead of guessing how long it takes.
 *
 * Tests across this repo synchronise with fixed sleeps —
 * `await new Promise((r) => setTimeout(r, 100))` and friends. That encodes a
 * guess about scheduler latency: too short is flaky under load, and long
 * enough to be safe wastes wall clock on every run forever after.
 *
 * Prefer awaiting an observable signal where one exists (a completion event, a
 * promise the code under test already returns). Reach for this when there is
 * genuinely nothing to await, only state to observe.
 *
 * The `description` is what the failure message says the test was waiting for,
 * so write it as the condition: `"the import job to finish"`, not `"job"`.
 */
export async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  description: string,
  options: WaitUntilOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const intervalMs = options.intervalMs ?? 10;
  const startedAt = performance.now();

  // Recursive rather than a counted loop, matching the codebase's iteration
  // style. A predicate that throws propagates instead of being retried: a
  // broken assertion should surface now, not after the deadline.
  const attempt = async (): Promise<void> => {
    if (await predicate()) return;

    const waited = performance.now() - startedAt;
    if (waited >= timeoutMs) {
      throw new Error(
        `Timed out after ${Math.round(waited)}ms waiting for ${description}`,
      );
    }

    await Bun.sleep(intervalMs);
    return attempt();
  };

  return attempt();
}
