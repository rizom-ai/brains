import { Cause, Effect, Either, Exit } from "@brains/effect-runtime";

/**
 * Run an internal Effect through a Promise API without exposing FiberFailure.
 * Existing shell callers continue receiving the original failure value.
 */
export async function runEffectPromise<A, E>(
  effect: Effect.Effect<A, E>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

/**
 * Run sibling Promise operations concurrently, settling every operation before
 * rethrowing the first failure in declaration order.
 */
export async function runConcurrentPhase(
  operations: ReadonlyArray<() => Promise<void>>,
): Promise<void> {
  const results = await runEffectPromise(
    Effect.all(
      operations.map((operation) =>
        Effect.either(
          Effect.tryPromise({
            try: operation,
            catch: (error) => error,
          }),
        ),
      ),
      { concurrency: "unbounded" },
    ),
  );
  const firstFailure = results.find(Either.isLeft);
  if (firstFailure) throw firstFailure.left;
}
