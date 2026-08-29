import { describe, expect, it, jest } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { BunSchedulerBackend } from "../src";
import { TestSchedulerBackend } from "../src/test";

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

  it("supports the standard five-field expression subset", () => {
    const scheduler = new TestSchedulerBackend();

    for (const expression of [
      "* * * * *",
      "*/15 9-17 * JAN,MAR MON-FRI",
      "0 0 15 * FRI",
      "@daily",
    ]) {
      expect(() => scheduler.validateCron(expression)).not.toThrow();
    }
  });

  it("rejects six-field schedules with a seconds migration message", () => {
    const scheduler = new TestSchedulerBackend();

    expect(() => scheduler.validateCron("* * * * * *")).toThrow(
      /5 fields.*seconds are not supported/i,
    );
  });

  it("rejects schedules with no possible future occurrence", () => {
    const scheduler = new TestSchedulerBackend();

    expect(() => scheduler.validateCron("0 0 30 2 *")).toThrow(
      /no future occurrences/i,
    );
  });

  it("uses POSIX OR semantics for restricted month-day and weekday", async () => {
    const scheduler = new TestSchedulerBackend({
      now: new Date("2026-05-16T00:00:00.000Z"),
    });
    const runs: string[] = [];
    scheduler.scheduleCron(
      "0 0 15 * FRI",
      () => {
        runs.push(scheduler.now().toISOString());
      },
      { timezone: "UTC" },
    );

    await scheduler.advanceTo(new Date("2026-05-22T00:00:00.000Z"));

    expect(runs).toEqual(["2026-05-22T00:00:00.000Z"]);
  });

  it("shifts a missing DST time forward by the spring gap", async () => {
    const scheduler = new TestSchedulerBackend({
      now: new Date("2026-03-08T06:00:00.000Z"),
    });
    const runs: string[] = [];
    scheduler.scheduleCron(
      "30 2 * * *",
      () => {
        runs.push(scheduler.now().toISOString());
      },
      { timezone: "America/New_York" },
    );

    await scheduler.advanceTo(new Date("2026-03-08T07:30:00.000Z"));

    expect(runs).toEqual(["2026-03-08T07:30:00.000Z"]);
  });

  it("runs a fixed time once in the duplicated fall DST hour", async () => {
    const scheduler = new TestSchedulerBackend({
      now: new Date("2026-11-01T04:00:00.000Z"),
    });
    const runs: string[] = [];
    scheduler.scheduleCron(
      "30 1 * * *",
      () => {
        runs.push(scheduler.now().toISOString());
      },
      { timezone: "America/New_York" },
    );

    await scheduler.advanceTo(new Date("2026-11-01T07:00:00.000Z"));

    expect(runs).toEqual(["2026-11-01T05:30:00.000Z"]);
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

describe("BunSchedulerBackend lifecycle", () => {
  it("runs an in-process cron on the scheduled minute", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-14T00:00:30.000Z"));
    const scheduler = new BunSchedulerBackend();
    let calls = 0;
    const job = scheduler.scheduleCron("* * * * *", () => {
      calls++;
    });

    try {
      jest.advanceTimersByTime(29_999);
      await Effect.runPromise(yieldToFibers());
      expect(calls).toBe(0);

      jest.advanceTimersByTime(1);
      await Effect.runPromise(yieldToFibers());
      expect(calls).toBe(1);
    } finally {
      await job.stop();
      jest.useRealTimers();
    }
  });

  it("reports overlapping cron ticks and drains the active cycle on stop", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-14T00:00:30.000Z"));
    let releaseCycle: (() => void) | undefined;
    const activeCycle = new Promise<void>((resolve) => {
      releaseCycle = resolve;
    });
    let calls = 0;
    let skipped = 0;
    const scheduler = new BunSchedulerBackend({
      onOverlapSkipped: (): void => {
        skipped++;
      },
    });
    const job = scheduler.scheduleCron("* * * * *", async () => {
      calls++;
      await activeCycle;
    });

    try {
      jest.advanceTimersByTime(30_000);
      await Effect.runPromise(yieldToFibers());
      expect(calls).toBe(1);

      jest.advanceTimersByTime(60_000);
      await Effect.runPromise(yieldToFibers());
      expect(calls).toBe(1);
      expect(skipped).toBe(1);

      let stopSettled = false;
      const stopping = job.stop().then(() => {
        stopSettled = true;
      });
      await Effect.runPromise(yieldToFibers());
      expect(stopSettled).toBe(false);

      releaseCycle?.();
      await stopping;
      expect(stopSettled).toBe(true);
    } finally {
      releaseCycle?.();
      await job.stop();
      jest.useRealTimers();
    }
  });

  it("reports cron callback errors without stopping later runs", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-14T00:00:30.000Z"));
    const failure = new Error("cron failed");
    const errors: unknown[] = [];
    let calls = 0;
    const scheduler = new BunSchedulerBackend({
      onCallbackError: (_jobKey, error): void => {
        errors.push(error);
      },
    });
    const job = scheduler.scheduleCron("* * * * *", () => {
      calls++;
      throw failure;
    });

    try {
      jest.advanceTimersByTime(30_000);
      await Effect.runPromise(yieldToFibers());
      expect(errors).toEqual([failure]);

      jest.advanceTimersByTime(60_000);
      await Effect.runPromise(yieldToFibers());
      expect(calls).toBe(2);
      expect(errors).toEqual([failure, failure]);
    } finally {
      await job.stop();
      jest.useRealTimers();
    }
  });

  it("uses the injected clock and waits one interval before the first cycle", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const scheduler = new BunSchedulerBackend({ clock });
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
        const scheduler = new BunSchedulerBackend({
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
