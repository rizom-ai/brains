import { describe, expect, it, jest, spyOn } from "bun:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { deferred } from "@brains/utils/deferred";
import { Effect, Scope } from "@brains/utils/effect";
import { TestClock } from "@brains/utils/effect/test";
import { BunSchedulerBackend } from "../src";
import { TestSchedulerBackend } from "../src/test";

function yieldToFibers(): Effect.Effect<void> {
  return Effect.yieldNow.pipe(Effect.andThen(Effect.yieldNow));
}

function failNativeCronStops(failure: unknown): {
  readonly stopCalls: number;
  restore(): void;
} {
  const originalCron = Bun.cron;
  const crons: Array<{ cron: Bun.CronJob; stop: Bun.CronJob["stop"] }> = [];
  let stopCalls = 0;
  function interceptedCron(
    expression: Bun.CronWithAutocomplete,
    callback: (this: Bun.CronJob) => unknown,
    options?: Bun.CronOptions,
  ): Bun.CronJob;
  function interceptedCron(
    path: string,
    expression: Bun.CronWithAutocomplete,
    title: string,
  ): Promise<void>;
  function interceptedCron(
    expression: string,
    callback: Bun.CronWithAutocomplete | ((this: Bun.CronJob) => unknown),
    options?: Bun.CronOptions | string,
  ): Bun.CronJob | Promise<void> {
    if (typeof callback !== "function") {
      if (typeof options !== "string")
        throw new Error("Expected a file-backed cron title");
      return originalCron(expression, callback, options);
    }
    if (typeof options === "string")
      throw new Error("Unexpected in-process cron title");
    const cron = originalCron(expression, callback, options);
    crons.push({ cron, stop: cron.stop });
    cron.stop = (): never => {
      stopCalls += 1;
      throw failure;
    };
    return cron;
  }
  const helpers = { parse: originalCron.parse, remove: originalCron.remove };
  const factory = spyOn(Bun, "cron").mockImplementation(
    Object.assign(interceptedCron, helpers),
  );
  // Function spies discard these native helpers; schedule validation still
  // needs the real parser, not a mock of the cron grammar.
  Object.assign(factory, helpers);
  return {
    get stopCalls(): number {
      return stopCalls;
    },
    restore: (): void => {
      for (const { cron, stop } of crons) {
        cron.stop = stop;
        stop.call(cron);
      }
      factory.mockRestore();
    },
  };
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
        const clock = yield* TestClock.testClockWith(Effect.succeed);
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
        expect(scheduler.now().getTime()).toBe(clock.currentTimeMillisUnsafe());
      }).pipe(Effect.provide(TestClock.layer())),
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

  it.each([
    ["Error", new Error("Native cron stop failed")],
    ["object", Object.freeze({ message: "Native cron stop failed" })],
    ["undefined", undefined],
    ["null", null],
    ["string", "Native cron stop failed"],
  ] as const)(
    "drains callbacks and closes their scope before reporting a native stop failure (%s)",
    async (_label, failure) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-07-14T00:00:30.000Z"));
      const native = failNativeCronStops(failure);
      const entered = deferred();
      const release = deferred();
      let calls = 0;
      const job = new BunSchedulerBackend().scheduleCron(
        "* * * * *",
        async () => {
          calls += 1;
          entered.resolve();
          await release.promise;
        },
      );
      const closeScope = spyOn(Scope, "close");
      let observed: Promise<unknown> | undefined;
      try {
        jest.advanceTimersByTime(30_000);
        await entered.promise;
        const stopping = job.stop();
        let settled = false;
        const outcome = stopping
          .then(
            () => ({ success: true as const }),
            (error: unknown) => ({ success: false as const, error }),
          )
          .finally(() => {
            settled = true;
          });
        observed = outcome;
        expect(job.stop()).toBe(stopping);
        await nextTurn();
        expect(settled).toBe(false);
        // Even a native trigger that failed to stop cannot admit another cycle.
        jest.advanceTimersByTime(60_000);
        await nextTurn();
        expect(calls).toBe(1);
        release.resolve();
        const result = await outcome;
        expect(result.success).toBe(false);
        if (result.success) throw new Error("Expected native stop failure");
        expect(result.error).toBe(failure);
        expect(closeScope).toHaveBeenCalledTimes(1);
        expect(native.stopCalls).toBe(1);
        expect(job.stop()).toBe(stopping);
      } finally {
        release.resolve();
        await observed;
        native.restore();
        closeScope.mockRestore();
        jest.useRealTimers();
      }
    },
  );

  it("preserves native-stop and scope-close failures in cleanup order", async () => {
    const nativeFailure = new Error("Native stop failed");
    const scopeFailure = new Error("Scope close failed");
    const native = failNativeCronStops(nativeFailure);
    const originalClose = Scope.close;
    const closeScope = spyOn(Scope, "close").mockImplementation((scope, exit) =>
      originalClose(scope, exit).pipe(Effect.andThen(Effect.die(scopeFailure))),
    );
    try {
      const job = new BunSchedulerBackend().scheduleCron("0 0 * * *", () => {});
      const error = await job.stop().catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(AggregateError);
      if (!(error instanceof AggregateError))
        throw new Error("Expected aggregate cleanup failure");
      expect(error.errors).toEqual([nativeFailure, scopeFailure]);
      expect(error.errors[0]).toBe(nativeFailure);
      expect(error.errors[1]).toBe(scopeFailure);
      expect(closeScope).toHaveBeenCalledTimes(1);
      expect(native.stopCalls).toBe(1);
    } finally {
      native.restore();
      closeScope.mockRestore();
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
        const clock = yield* TestClock.testClockWith(Effect.succeed);
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
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });

  it("skips overlapping cycles and drains the active cycle on stop", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClockWith(Effect.succeed);
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
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });
});
