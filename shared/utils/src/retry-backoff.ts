import { Cause, Clock, Effect, Exit, withOptionalClock } from "./effect";

export interface RetryWithBackoffOptions {
  /** Wait before the first retry; each refusal doubles it up to the ceiling. */
  firstDelayMs: number;
  /** The longest wait between two attempts. */
  maxDelayMs: number;
  /** Give up rather than wait until or past this time, in clock milliseconds. */
  giveUpAt?: number | undefined;
  /** Stops retrying. An attempt already running settles first. */
  signal?: AbortSignal | undefined;
  /** Effect clock the waits run on. Defaults to the live clock. */
  clock?: Clock.Clock | undefined;
  /** Called after each refusal that will be retried, before its wait. */
  onRetry?: ((error: unknown, delayMs: number) => void) | undefined;
}

export type RetryOutcome<T> =
  | { kind: "succeeded"; value: T }
  /** The next wait would have reached `giveUpAt`; `error` is the last refusal. */
  | { kind: "abandoned"; error: unknown }
  /** The signal aborted before an attempt succeeded. */
  | { kind: "stopped" };

/**
 * Retry an operation whose first attempt was refused with `error`: wait, then
 * attempt again, doubling the wait up to `maxDelayMs`, until an attempt
 * succeeds, the next wait would reach `giveUpAt`, or `signal` aborts.
 *
 * For work a caller must not lose to a transient refusal, such as a job-queue
 * enqueue refused while another process holds the queue's write lock. Every
 * refusal is retried; the attempt must be safe to repeat after one.
 */
export async function retryWithBackoff<T>(
  attempt: () => Promise<T>,
  error: unknown,
  options: RetryWithBackoffOptions,
): Promise<RetryOutcome<T>> {
  const { firstDelayMs, maxDelayMs, giveUpAt, signal, clock, onRetry } =
    options;
  // An attempt that succeeds while an abort is pending still happened; record
  // it here so the interruption that follows cannot hide it.
  let succeeded: { kind: "succeeded"; value: T } | undefined;

  const retry = (
    failures: number,
    refusal: unknown,
  ): Effect.Effect<RetryOutcome<T>> => {
    const delayMs = Math.min(firstDelayMs * 2 ** (failures - 1), maxDelayMs);
    return Clock.currentTimeMillis.pipe(
      Effect.flatMap((now) => {
        if (giveUpAt !== undefined && now + delayMs >= giveUpAt) {
          return Effect.succeed({ kind: "abandoned", error: refusal } as const);
        }
        onRetry?.(refusal, delayMs);
        return Effect.sleep(delayMs).pipe(
          Effect.andThen(
            // An admitted attempt settles before the retry can be interrupted.
            Effect.uninterruptibleMask((restore) =>
              Effect.tryPromise({
                try: () => attempt(),
                catch: (attemptError) => attemptError,
              }).pipe(
                Effect.matchEffect({
                  onSuccess: (value) =>
                    Effect.sync(() => {
                      succeeded = { kind: "succeeded", value };
                      return succeeded;
                    }),
                  onFailure: (attemptError) =>
                    restore(retry(failures + 1, attemptError)),
                }),
              ),
            ),
          ),
        );
      }),
    );
  };

  const exit = await Effect.runPromiseExit(
    withOptionalClock(retry(1, error), clock),
    signal ? { signal } : undefined,
  );
  if (Exit.isSuccess(exit)) return exit.value;
  if (succeeded) return succeeded;
  if (Cause.hasInterruptsOnly(exit.cause)) return { kind: "stopped" };
  throw Cause.squash(exit.cause);
}
