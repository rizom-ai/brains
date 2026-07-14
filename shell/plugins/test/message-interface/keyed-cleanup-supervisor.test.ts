import { describe, expect, test } from "bun:test";
import { Effect } from "@brains/effect-runtime";
import { TestClock, TestContext } from "@brains/effect-runtime/test";
import { KeyedCleanupSupervisor } from "../../src/message-interface/keyed-cleanup-supervisor";

function withSupervisor(
  run: (supervisor: KeyedCleanupSupervisor) => Effect.Effect<void>,
): Promise<void> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const clock = yield* TestClock.testClock();
      const supervisor = new KeyedCleanupSupervisor(500, { clock });
      yield* Effect.acquireUseRelease(
        Effect.succeed(supervisor),
        run,
        (ownedSupervisor) => Effect.promise(() => ownedSupervisor.close()),
      );
    }).pipe(Effect.provide(TestContext.TestContext)),
  );
}

describe("KeyedCleanupSupervisor", () => {
  test("runs cleanup only after its delay", async () => {
    await withSupervisor((supervisor) =>
      Effect.gen(function* () {
        let cleanupCalls = 0;
        supervisor.schedule("job-1", () => {
          cleanupCalls++;
        });

        yield* TestClock.adjust(499);
        expect(cleanupCalls).toBe(0);

        yield* TestClock.adjust(1);
        expect(cleanupCalls).toBe(1);
      }),
    );
  });

  test("replaces a pending cleanup with the same key", async () => {
    await withSupervisor((supervisor) =>
      Effect.gen(function* () {
        const cleanups: string[] = [];
        supervisor.schedule("job-1", () => {
          cleanups.push("first");
        });

        yield* TestClock.adjust(400);
        supervisor.schedule("job-1", () => {
          cleanups.push("replacement");
        });

        yield* TestClock.adjust(100);
        expect(cleanups).toEqual([]);

        yield* TestClock.adjust(400);
        expect(cleanups).toEqual(["replacement"]);
      }),
    );
  });

  test("interrupts pending cleanup when closed", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const supervisor = new KeyedCleanupSupervisor(500, { clock });
        let cleanupCalls = 0;
        supervisor.schedule("job-1", () => {
          cleanupCalls++;
        });

        yield* Effect.promise(() => supervisor.close());
        yield* TestClock.adjust(500);

        expect(cleanupCalls).toBe(0);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
