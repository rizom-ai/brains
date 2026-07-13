import { describe, expect, test } from "bun:test";
import { Cause, Effect, Exit, Fiber, TestClock, TestContext } from "effect";
import { makeIndexReadinessPollingEffect } from "../src/index-readiness";
import type { IndexReadinessStatus } from "../src/types";

function readinessStatus(ready: boolean): IndexReadinessStatus {
  return {
    ready,
    degraded: false,
    activeEmbeddingJobs: ready ? 0 : 1,
    missingEmbeddings: ready ? 0 : 1,
    staleEmbeddings: 0,
    failedEmbeddings: 0,
    embeddableEntities: 1,
    embeddedEntities: ready ? 1 : 0,
  };
}

describe("index readiness schedule", () => {
  test("polls at the configured cadence until ready", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        let attempts = 0;
        const polling = makeIndexReadinessPollingEffect(
          Effect.sync(() => readinessStatus(++attempts >= 3)),
          { intervalMs: 100, timeoutMs: 1_000 },
        );
        const fiber = yield* Effect.fork(polling);

        yield* Effect.yieldNow();
        expect(attempts).toBe(1);

        yield* TestClock.adjust(99);
        expect(attempts).toBe(1);

        yield* TestClock.adjust(1);
        expect(attempts).toBe(2);

        yield* TestClock.adjust(100);
        const status = yield* Fiber.join(fiber);
        expect(attempts).toBe(3);
        expect(status.ready).toBe(true);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  test("returns the latest diagnostics when the schedule times out", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        let attempts = 0;
        const polling = makeIndexReadinessPollingEffect(
          Effect.sync(() => {
            attempts++;
            return readinessStatus(false);
          }),
          { intervalMs: 100, timeoutMs: 250 },
        );
        const fiber = yield* Effect.fork(polling);

        yield* Effect.yieldNow();
        yield* TestClock.adjust(1_000);
        const status = yield* Fiber.join(fiber);

        expect(attempts).toBe(4);
        expect(status.ready).toBe(false);
        expect(status.missingEmbeddings).toBe(1);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  test("retries probe failures and preserves the final failure", async () => {
    const probeError = new Error("database unavailable");

    await Effect.runPromise(
      Effect.gen(function* () {
        let attempts = 0;
        const polling = makeIndexReadinessPollingEffect(
          Effect.sync(() => {
            attempts++;
          }).pipe(Effect.andThen(Effect.fail(probeError))),
          { intervalMs: 100, timeoutMs: 250 },
        );
        const fiber = yield* Effect.fork(polling);

        yield* Effect.yieldNow();
        yield* TestClock.adjust(1_000);
        const exit = yield* Fiber.await(fiber);

        expect(attempts).toBe(4);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.failureOption(exit.cause);
          expect(failure._tag).toBe("Some");
          if (failure._tag === "Some") expect(failure.value).toBe(probeError);
        }
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  test("runs without a timeout for an owning lifecycle", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        let attempts = 0;
        const polling = makeIndexReadinessPollingEffect(
          Effect.sync(() => readinessStatus(++attempts >= 2)),
          { intervalMs: 100 },
        );
        const fiber = yield* Effect.fork(polling);

        yield* Effect.yieldNow();
        yield* TestClock.adjust(10_000);
        const status = yield* Fiber.join(fiber);

        expect(attempts).toBe(2);
        expect(status.ready).toBe(true);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
