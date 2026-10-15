import { Cause, Clock, Effect, Exit, withOptionalClock } from "./effect";
import type { Logger } from "./logger";

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

/** The scope default: a second, doubling to a minute. */
export const DEFAULT_RETRY_FIRST_DELAY_MS = 1_000;
export const DEFAULT_RETRY_MAX_DELAY_MS = 60_000;

export interface RetryScopeOptions {
  firstDelayMs?: number | undefined;
  maxDelayMs?: number | undefined;
  clock?: Clock.Clock | undefined;
  logger: Pick<Logger, "warn" | "error">;
}

/**
 * Background retries owned by one lifetime, such as a plugin's: a refused
 * attempt keeps retrying until it succeeds or the scope is disposed. Disposal
 * stops every retry, waits for admitted attempts to settle, and admits no
 * new retries.
 */
export class RetryScope {
  private readonly options: RetryScopeOptions;
  private readonly controller = new AbortController();
  private readonly running = new Set<Promise<unknown>>();
  private readonly keyed = new Map<string, AbortController>();

  constructor(options: RetryScopeOptions) {
    this.options = options;
  }

  /**
   * Retry `attempt`, whose first try was refused with `error`. `description`
   * names the work in logs, as in "queue a site build". A retry under the same
   * `key` supersedes a pending one, so repeated requests for one piece of
   * work keep one retry, not one each.
   */
  retry<T>(
    attempt: () => Promise<T>,
    error: unknown,
    description: string,
    key?: string,
  ): Promise<RetryOutcome<T>> {
    const { clock, logger } = this.options;
    const superseded = new AbortController();
    if (key !== undefined) {
      this.keyed.get(key)?.abort();
      this.keyed.set(key, superseded);
    }
    const outcome = retryWithBackoff(attempt, error, {
      firstDelayMs: this.options.firstDelayMs ?? DEFAULT_RETRY_FIRST_DELAY_MS,
      maxDelayMs: this.options.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS,
      clock,
      signal: AbortSignal.any([this.controller.signal, superseded.signal]),
      onRetry: (refusal, delayMs) => {
        logger.warn(`Failed to ${description}; retrying in ${delayMs}ms`, {
          error: refusal,
        });
      },
    }).catch((failure: unknown): RetryOutcome<T> => {
      // Only a defect outside the attempt reaches here; the attempt's own
      // refusals are retried. Log it and report the retry as stopped.
      logger.error(`Retrying "${description}" failed`, { error: failure });
      return { kind: "stopped" };
    });
    this.running.add(outcome);
    void outcome.then(() => {
      this.running.delete(outcome);
      if (key !== undefined && this.keyed.get(key) === superseded) {
        this.keyed.delete(key);
      }
    });
    return outcome;
  }

  /**
   * Run `operation` now; if it fails, keep retrying it in the background.
   * Resolves once the first try settles, so a caller keeps its latency.
   */
  async run(
    operation: () => Promise<unknown>,
    description: string,
    key?: string,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      // Not flattened: the refusal is handed to a retry this scope owns.
      void this.retry(operation, error, description, key);
    }
  }

  /** Stop the pending retry under `key`, as when newer work replaced it. */
  cancel(key: string): void {
    this.keyed.get(key)?.abort();
    this.keyed.delete(key);
  }

  async dispose(): Promise<void> {
    this.controller.abort();
    await Promise.all([...this.running]);
  }
}
