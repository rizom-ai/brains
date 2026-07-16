import { describe, expect, it } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { A2ATurnSupervisor } from "../src/turn-supervisor";

function deferred(): { promise: Promise<void>; resolve(): void } {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

describe("A2ATurnSupervisor", () => {
  it("runs heartbeats on the injected Effect clock and stops them on close", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const supervisor = new A2ATurnSupervisor({ clock });
        let heartbeats = 0;

        supervisor.start("task-1", () => new Promise<void>(() => {}), {
          onCancel: (): void => {},
          heartbeat: {
            intervalMs: 1_000,
            tick: (): void => {
              heartbeats++;
            },
          },
        });

        yield* TestClock.adjust(999);
        expect(heartbeats).toBe(0);
        yield* TestClock.adjust(1);
        expect(heartbeats).toBe(1);
        yield* TestClock.adjust(1_000);
        expect(heartbeats).toBe(2);

        yield* Effect.promise(() => supervisor.close());
        yield* TestClock.adjust(10_000);
        expect(heartbeats).toBe(2);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("stops a task heartbeat when the operation completes", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const supervisor = new A2ATurnSupervisor({ clock });
        const release = deferred();
        let heartbeats = 0;

        supervisor.start("task-1", () => release.promise, {
          onCancel: (): void => {},
          heartbeat: {
            intervalMs: 100,
            tick: (): void => {
              heartbeats++;
            },
          },
        });

        yield* TestClock.adjust(100);
        expect(heartbeats).toBe(1);
        release.resolve();
        yield* Effect.yieldNow();
        yield* Effect.yieldNow();
        yield* TestClock.adjust(1_000);
        expect(heartbeats).toBe(1);

        yield* Effect.promise(() => supervisor.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("preserves the cancellation reason and releases exactly once", async () => {
    const supervisor = new A2ATurnSupervisor();
    const reason = new Error("caller disconnected");
    let receivedSignal: AbortSignal | undefined;
    let releases = 0;

    supervisor.start(
      "task-1",
      (signal) => {
        receivedSignal = signal;
        return new Promise<void>(() => {});
      },
      {
        onCancel: (): void => {
          releases++;
        },
      },
    );
    await Promise.resolve();

    expect(supervisor.cancel("task-1", reason)).toBe(true);
    expect(receivedSignal?.reason).toBe(reason);
    expect(supervisor.cancel("task-1", new Error("second"))).toBe(true);
    await supervisor.close();
    expect(releases).toBe(1);
  });
});
