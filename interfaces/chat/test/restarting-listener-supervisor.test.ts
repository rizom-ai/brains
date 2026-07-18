import { describe, expect, it } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { RestartingListenerSupervisor } from "../src/restarting-listener-supervisor";

describe("RestartingListenerSupervisor", () => {
  it("restarts on the injected clock and stops future cycles", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        let cycles = 0;
        const supervisor = new RestartingListenerSupervisor({
          restartDelayMs: 1_000,
          runListener: async (): Promise<void> => {
            cycles++;
          },
          failureMessage: "listener failed",
          logger: { error: (): void => {} },
          clock,
        });

        supervisor.start();
        yield* Effect.yieldNow();
        yield* Effect.yieldNow();
        expect(cycles).toBe(1);

        yield* TestClock.adjust(999);
        expect(cycles).toBe(1);
        yield* TestClock.adjust(1);
        expect(cycles).toBe(2);

        yield* Effect.promise(() => supervisor.stop());
        yield* TestClock.adjust(10_000);
        expect(cycles).toBe(2);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
