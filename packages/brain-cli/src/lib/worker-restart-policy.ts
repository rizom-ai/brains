/**
 * When the supervisor restarts a crashed worker, and when it gives up.
 *
 * The policy is separated from the timers that enact it because it is a set of
 * decisions, not machinery: given what has already been attempted and how long
 * ago, may the worker start again, and after how long. That makes it something
 * to read and test directly, rather than infer from a closure that also owns
 * child processes, sockets and signal handlers.
 */

/**
 * The backoff doubles per consecutive failure and then stops.
 *
 * Without a cap a long-running brain whose worker fails repeatedly would push
 * the delay past any useful bound — at a 500ms base, thirty failures would be
 * years — and the supervisor would look hung rather than broken.
 */
export const MAX_RESTART_BACKOFF_DOUBLINGS = 10;

/**
 * The attempts still counted against the restart budget.
 *
 * An attempt exactly one window old has aged out: the window is how recently
 * something must have failed to still be evidence that it keeps failing.
 */
export function attemptsWithinWindow(
  attempts: readonly number[],
  now: number,
  windowMs: number,
): number[] {
  return attempts.filter((attempt) => now - attempt < windowMs);
}

/**
 * How long to wait before starting the worker again.
 *
 * The first restart is immediate, so a single crash is invisible to anyone
 * using the brain. Repeated failures back off, because restarting instantly
 * in a loop hides the fault and burns the machine.
 */
export function restartDelayMs(
  consecutiveFailures: number,
  baseMs: number,
): number {
  if (consecutiveFailures === 0) return 0;
  const doublings = Math.min(
    consecutiveFailures - 1,
    MAX_RESTART_BACKOFF_DOUBLINGS,
  );
  return baseMs * 2 ** doublings;
}

/** Whether enough recent attempts have been made to stop trying. */
export function isRestartBudgetExhausted(
  recentAttempts: number,
  budget: number,
): boolean {
  return recentAttempts >= budget;
}
