import { describe, expect, it } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { runWithInterruptibleTimeout } from "../src/client-lifecycle";

class TestTimeoutError extends Error {}

describe("A2A client lifecycle", () => {
  it("uses the injected clock and aborts the timed operation", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        let operationSignal: AbortSignal | undefined;
        let settled = false;
        const pending = runWithInterruptibleTimeout(
          (signal) => {
            operationSignal = signal;
            return new Promise<void>(() => {});
          },
          {
            timeoutMs: 1_000,
            onTimeout: () => new TestTimeoutError("timed out"),
            clock,
          },
        );
        const outcome = pending.then(
          () => ({ error: undefined }),
          (error: unknown) => ({ error }),
        );
        void outcome.then(() => {
          settled = true;
        });

        yield* Effect.yieldNow();
        yield* TestClock.adjust(999);
        expect(settled).toBe(false);
        expect(operationSignal?.aborted).toBe(false);

        yield* TestClock.adjust(1);
        const result = yield* Effect.promise(() => outcome);
        expect(result.error).toBeInstanceOf(TestTimeoutError);
        expect(operationSignal?.aborted).toBe(true);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
