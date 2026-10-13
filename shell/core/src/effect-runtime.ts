import { Effect, Result } from "@brains/utils/effect";

/**
 * Run sibling Promise operations concurrently, settling every operation before
 * rethrowing the first failure in declaration order.
 */
export async function runConcurrentPhase(
  operations: ReadonlyArray<() => Promise<void>>,
): Promise<void> {
  const results = await Effect.runPromise(
    Effect.all(
      operations.map((operation) =>
        Effect.result(
          Effect.tryPromise({
            try: operation,
            catch: (error) => error,
          }),
        ),
      ),
      { concurrency: "unbounded" },
    ),
  );
  const firstFailure = results.find(Result.isFailure);
  if (firstFailure) throw firstFailure.failure;
}
