import { describe, expect, it } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { CronerBackend, TestSchedulerBackend } from "../src";

function yieldToFibers(): Effect.Effect<void> {
  return Effect.yieldNow().pipe(Effect.andThen(Effect.yieldNow()));
}

describe("TestSchedulerBackend", () => {
  it("runs interval callbacks at each elapsed cadence", async () => {
    const scheduler = new TestSchedulerBackend({
      now: new Date("2026-07-14T00:00:00.000Z"),
    });
    const runs: string[] = [];
    scheduler.scheduleInterval(60_000, () => {
      runs.push(scheduler.now().toISOString());
    });

    await scheduler.advanceBy(150_000);

    expect(runs).toEqual([
      "2026-07-14T00:01:00.000Z",
      "2026-07-14T00:02:00.000Z",
    ]);
    expect(scheduler.now().toISOString()).toBe("2026-07-14T00:02:30.000Z");
  });

  it("uses Effect TestClock as its single injected time source", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const scheduler = new TestSchedulerBackend({ clock });
        let runs = 0;
        scheduler.scheduleInterval(1_000, () => {
          runs += 1;
        });

        yield* TestClock.adjust(999);
        yield* Effect.promise(() => scheduler.runDue());
        expect(runs).toBe(0);

        yield* TestClock.adjust(1);
        yield* Effect.promise(() => scheduler.runDue());
        expect(runs).toBe(1);
        expect(scheduler.now().getTime()).toBe(clock.unsafeCurrentTimeMillis());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("uses injected time to evaluate cron cadence", async () => {
    const scheduler = new TestSchedulerBackend({
      now: new Date("2026-07-14T00:00:30.000Z"),
    });
    const runs: string[] = [];
    scheduler.scheduleCron("* * * * *", () => {
      runs.push(scheduler.now().toISOString());
    });

    await scheduler.advanceTo(new Date("2026-07-14T00:02:00.000Z"));

    expect(runs).toEqual([
      "2026-07-14T00:01:00.000Z",
      "2026-07-14T00:02:00.000Z",
    ]);
  });

  it("evaluates cron cadence in the requested timezone", async () => {
    const scheduler = new TestSchedulerBackend({
      now: new Date("2026-01-05T13:59:00.000Z"),
    });
    const runs: string[] = [];
    scheduler.scheduleCron(
      "0 9 * * *",
      () => {
        runs.push(scheduler.now().toISOString());
      },
      { timezone: "America/New_York" },
    );

    await scheduler.advanceTo(new Date("2026-01-05T14:00:00.000Z"));

    expect(runs).toEqual(["2026-01-05T14:00:00.000Z"]);
  });

  it("supports independent jobs with the same cron expression", async () => {
    const scheduler = new TestSchedulerBackend();
    const runs: string[] = [];
    scheduler.scheduleCron("0 0 * * *", () => {
      runs.push("first");
    });
    scheduler.scheduleCron("0 0 * * *", () => {
      runs.push("second");
    });

    await scheduler.tickCrons();

    expect(runs).toEqual(["first", "second"]);
  });

  it("reset removes jobs and restores the initial clock", async () => {
    const initialTime = new Date("2026-07-14T12:00:00.000Z");
    const scheduler = new TestSchedulerBackend({ now: initialTime });
    let runs = 0;
    scheduler.scheduleInterval(1_000, () => {
      runs += 1;
    });
    await scheduler.advanceBy(1_000);

    scheduler.reset();
    await scheduler.advanceBy(10_000);

    expect(runs).toBe(1);
    expect(scheduler.getIntervalCount()).toBe(0);
    expect(scheduler.now()).toEqual(new Date("2026-07-14T12:00:10.000Z"));
  });

  it("settles all due callbacks before surfacing callback failure", async () => {
    const scheduler = new TestSchedulerBackend();
    const failure = new Error("check failed");
    let successfulRuns = 0;
    scheduler.scheduleInterval(1_000, () => {
      throw failure;
    });
    scheduler.scheduleInterval(1_000, () => {
      successfulRuns += 1;
    });

    const run = scheduler.advanceBy(1_000);
    expect(run).rejects.toBe(failure);
    await run.catch(() => undefined);
    expect(successfulRuns).toBe(1);
  });

  it("stopped jobs do not run", async () => {
    const scheduler = new TestSchedulerBackend();
    let runs = 0;
    const job = scheduler.scheduleInterval(1_000, () => {
      runs += 1;
    });
    await job.stop();

    await scheduler.advanceBy(1_000);

    expect(runs).toBe(0);
  });

  it("drains active manual callbacks when a test job stops", async () => {
    const scheduler = new TestSchedulerBackend();
    let releaseCycle: (() => void) | undefined;
    const activeCycle = new Promise<void>((resolve) => {
      releaseCycle = resolve;
    });
    const job = scheduler.scheduleInterval(1_000, () => activeCycle);
    const ticking = scheduler.tickIntervals();
    await Promise.resolve();

    let stopSettled = false;
    const stopping = job.stop().then(() => {
      stopSettled = true;
    });
    await Promise.resolve();
    expect(stopSettled).toBe(false);

    releaseCycle?.();
    await Promise.all([ticking, stopping]);
    expect(stopSettled).toBe(true);
  });
});

describe("CronerBackend lifecycle", () => {
  it("uses the injected clock and waits one interval before the first cycle", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const scheduler = new CronerBackend({ clock });
        let calls = 0;
        const job = scheduler.scheduleInterval(100, () => {
          calls++;
        });

        yield* TestClock.adjust(99);
        yield* yieldToFibers();
        expect(calls).toBe(0);

        yield* TestClock.adjust(1);
        yield* yieldToFibers();
        expect(calls).toBe(1);

        yield* Effect.promise(() => job.stop());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("skips overlapping cycles and drains the active cycle on stop", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        let releaseFirst: (() => void) | undefined;
        const firstCycle = new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        let calls = 0;
        let skipped = 0;
        const scheduler = new CronerBackend({
          clock,
          onOverlapSkipped: (): void => {
            skipped++;
          },
        });
        const job = scheduler.scheduleInterval(100, async () => {
          calls++;
          if (calls === 1) await firstCycle;
        });

        yield* TestClock.adjust(100);
        yield* yieldToFibers();
        expect(calls).toBe(1);

        yield* TestClock.adjust(100);
        yield* yieldToFibers();
        expect(calls).toBe(1);
        expect(skipped).toBe(1);

        let stopSettled = false;
        const stopping = job.stop().then(() => {
          stopSettled = true;
        });
        yield* yieldToFibers();
        expect(stopSettled).toBe(false);

        releaseFirst?.();
        yield* Effect.promise(() => stopping);
        expect(stopSettled).toBe(true);

        yield* TestClock.adjust(500);
        yield* yieldToFibers();
        expect(calls).toBe(1);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
