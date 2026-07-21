import { Cause, Effect, Exit } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";

interface InterruptibleTimeoutOptions<E> {
  timeoutMs: number;
  onTimeout: () => E;
  signal?: AbortSignal | undefined;
  clock?: Clock.Clock | undefined;
}

/** Runs one Promise adapter with Effect-owned timeout and caller cancellation. */
export async function runWithInterruptibleTimeout<A, E>(
  operation: (signal: AbortSignal) => PromiseLike<A>,
  options: InterruptibleTimeoutOptions<E>,
): Promise<A> {
  const callerSignal = options.signal;
  callerSignal?.throwIfAborted();

  const operationController = new AbortController();
  const abortFromCaller = (): void => {
    if (!operationController.signal.aborted) {
      operationController.abort(callerSignal?.reason);
    }
  };
  callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  if (callerSignal?.aborted) abortFromCaller();

  const operationEffect = Effect.tryPromise({
    try: (effectSignal) => {
      const abortFromEffect = (): void => {
        if (!operationController.signal.aborted) {
          operationController.abort(effectSignal.reason);
        }
      };
      effectSignal.addEventListener("abort", abortFromEffect, { once: true });
      if (effectSignal.aborted) abortFromEffect();

      return Promise.resolve(operation(operationController.signal)).finally(
        () => {
          effectSignal.removeEventListener("abort", abortFromEffect);
        },
      );
    },
    catch: (error) => error,
  }).pipe(
    Effect.timeoutFail({
      duration: Math.max(0, options.timeoutMs),
      onTimeout: options.onTimeout,
    }),
  );
  const timedEffect = options.clock
    ? Effect.withClock(operationEffect, options.clock)
    : operationEffect;

  try {
    const exit = await Effect.runPromiseExit(
      timedEffect,
      callerSignal ? { signal: callerSignal } : undefined,
    );
    if (Exit.isSuccess(exit)) return exit.value;
    if (callerSignal?.aborted) throw callerSignal.reason;
    throw Cause.squash(exit.cause);
  } finally {
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
