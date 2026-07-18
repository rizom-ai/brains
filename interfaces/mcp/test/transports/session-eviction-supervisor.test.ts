import { describe, expect, it } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { SessionEvictionSupervisor } from "../../src/transports/session-eviction-supervisor";

function deferred(): { promise: Promise<void>; resolve(): void } {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

describe("SessionEvictionSupervisor", () => {
  it("runs idle-session sweeps on the injected Effect clock", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const sweepTimes: number[] = [];
        const supervisor = new SessionEvictionSupervisor(
          100,
          async (now) => {
            sweepTimes.push(now);
          },
          { clock },
        );

        yield* TestClock.adjust(99);
        expect(sweepTimes).toEqual([]);
        yield* TestClock.adjust(1);
        expect(sweepTimes).toEqual([100]);
        yield* TestClock.adjust(100);
        expect(sweepTimes).toEqual([100, 200]);

        yield* Effect.promise(() => supervisor.close());
        yield* TestClock.adjust(1_000);
        expect(sweepTimes).toEqual([100, 200]);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("does not overlap sweeps and drains an admitted sweep on close", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const release = deferred();
        let sweeps = 0;
        const supervisor = new SessionEvictionSupervisor(
          100,
          async () => {
            sweeps++;
            await release.promise;
          },
          { clock },
        );

        yield* TestClock.adjust(100);
        expect(sweeps).toBe(1);
        yield* TestClock.adjust(1_000);
        expect(sweeps).toBe(1);

        let closed = false;
        const closing = supervisor.close().then(() => {
          closed = true;
        });
        yield* Effect.yieldNow();
        expect(closed).toBe(false);

        release.resolve();
        yield* Effect.promise(() => closing);
        expect(closed).toBe(true);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("reports a failed sweep and continues the schedule", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const failure = new Error("close failed");
        const errors: unknown[] = [];
        let sweeps = 0;
        const supervisor = new SessionEvictionSupervisor(
          100,
          async () => {
            sweeps++;
            if (sweeps === 1) throw failure;
          },
          {
            clock,
            onError: (error): void => {
              errors.push(error);
            },
          },
        );

        yield* TestClock.adjust(100);
        expect(errors).toEqual([failure]);
        yield* TestClock.adjust(100);
        expect(sweeps).toBe(2);

        yield* Effect.promise(() => supervisor.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
