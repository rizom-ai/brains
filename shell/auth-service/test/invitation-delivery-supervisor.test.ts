import { describe, expect, it } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { InvitationDeliverySupervisor } from "../src/invitation-delivery-supervisor";

function deferred(): { promise: Promise<void>; resolve(): void } {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

describe("InvitationDeliverySupervisor", () => {
  it("runs recovery immediately, schedules without overlap, and drains shutdown", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const release = deferred();
        const recoveryTimes: number[] = [];
        const supervisor = new InvitationDeliverySupervisor(
          100,
          async (now) => {
            recoveryTimes.push(now);
            if (recoveryTimes.length === 2) await release.promise;
          },
          { clock },
        );

        yield* Effect.promise(() => supervisor.start());
        expect(recoveryTimes).toEqual([0]);
        yield* TestClock.adjust(100);
        expect(recoveryTimes).toEqual([0, 100]);
        yield* TestClock.adjust(1_000);
        expect(recoveryTimes).toEqual([0, 100]);

        let closed = false;
        const firstClose = supervisor.close();
        const secondClose = supervisor.close();
        expect(secondClose).toBe(firstClose);
        void firstClose.then(() => {
          closed = true;
        });
        yield* Effect.yieldNow();
        expect(closed).toBe(false);

        release.resolve();
        yield* Effect.promise(() => firstClose);
        expect(closed).toBe(true);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("reports recovery failures and continues", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const failure = new Error("recovery failed");
        const errors: unknown[] = [];
        let runs = 0;
        const supervisor = new InvitationDeliverySupervisor(
          100,
          async () => {
            runs += 1;
            if (runs === 1) throw failure;
          },
          { clock, onError: (error): void => void errors.push(error) },
        );

        yield* Effect.promise(() => supervisor.start());
        expect(errors).toEqual([failure]);
        yield* TestClock.adjust(100);
        expect(runs).toBe(2);
        yield* Effect.promise(() => supervisor.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
