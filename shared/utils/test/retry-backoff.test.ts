import { describe, expect, it } from "bun:test";
import { Effect } from "../src/effect";
import { TestClock } from "../src/effect-test";
import {
  RetryScope,
  retryWithBackoff,
  type RetryOutcome,
} from "../src/retry-backoff";

function withTestClock(
  body: (clock: TestClock.TestClock) => Promise<void>,
): Promise<void> {
  return Effect.runPromise(
    TestClock.testClockWith((clock) => Effect.promise(() => body(clock))).pipe(
      Effect.provide(TestClock.layer()),
    ),
  );
}

async function advance(clock: TestClock.TestClock, ms: number): Promise<void> {
  await Effect.runPromise(clock.adjust(ms));
  // Let the woken retry run its attempt before the next assertion.
  await Bun.sleep(5);
}

const quiet = { warn: (): void => {}, error: (): void => {} };

/** An attempt refused a set number of times, recording when it ran. */
function refusing(
  clock: TestClock.TestClock,
  refusals: number,
): { attempt: () => Promise<string>; ranAt: number[] } {
  const ranAt: number[] = [];
  return {
    ranAt,
    attempt: async (): Promise<string> => {
      ranAt.push(clock.currentTimeMillisUnsafe());
      if (ranAt.length <= refusals) throw new Error("refused");
      return "job-1";
    },
  };
}

describe("retryWithBackoff", () => {
  it("retries after a doubling delay capped at the ceiling until it succeeds", async () => {
    await withTestClock(async (clock) => {
      const { attempt, ranAt } = refusing(clock, 3);
      const delays: number[] = [];
      const outcome = retryWithBackoff(attempt, new Error("first"), {
        firstDelayMs: 1_000,
        maxDelayMs: 3_000,
        clock,
        onRetry: (_error, delayMs) => delays.push(delayMs),
      });

      await advance(clock, 1_000);
      await advance(clock, 2_000);
      await advance(clock, 3_000);
      await advance(clock, 3_000);

      expect(await outcome).toEqual({ kind: "succeeded", value: "job-1" });
      expect(ranAt).toEqual([1_000, 3_000, 6_000, 9_000]);
      expect(delays).toEqual([1_000, 2_000, 3_000, 3_000]);
    });
  });

  it("gives up rather than wait until the deadline", async () => {
    await withTestClock(async (clock) => {
      const { attempt, ranAt } = refusing(clock, 10);
      const outcome = retryWithBackoff(attempt, new Error("first"), {
        firstDelayMs: 1_000,
        maxDelayMs: 60_000,
        giveUpAt: 4_000,
        clock,
      });

      await advance(clock, 1_000);
      await advance(clock, 2_000);

      const settled: RetryOutcome<string> = await outcome;
      expect(settled.kind).toBe("abandoned");
      expect(ranAt).toEqual([1_000, 3_000]);
    });
  });

  it("stops waiting once aborted", async () => {
    await withTestClock(async (clock) => {
      const { attempt, ranAt } = refusing(clock, 0);
      const controller = new AbortController();
      const outcome = retryWithBackoff(attempt, new Error("first"), {
        firstDelayMs: 1_000,
        maxDelayMs: 60_000,
        signal: controller.signal,
        clock,
      });

      controller.abort();
      expect(await outcome).toEqual({ kind: "stopped" });
      await advance(clock, 10_000);
      expect(ranAt).toEqual([]);
    });
  });

  it("reports an attempt that was running when aborted", async () => {
    await withTestClock(async (clock) => {
      const controller = new AbortController();
      let admit!: () => void;
      const admitted = new Promise<void>((resolve) => {
        admit = resolve;
      });
      let started = false;
      const outcome = retryWithBackoff(
        async () => {
          started = true;
          await admitted;
          return "job-1";
        },
        new Error("first"),
        {
          firstDelayMs: 1_000,
          maxDelayMs: 60_000,
          signal: controller.signal,
          clock,
        },
      );

      await advance(clock, 1_000);
      expect(started).toBe(true);
      controller.abort();
      admit();

      expect(await outcome).toEqual({ kind: "succeeded", value: "job-1" });
    });
  });

  it("does not start when the signal is already aborted", async () => {
    await withTestClock(async (clock) => {
      const { attempt, ranAt } = refusing(clock, 0);
      const outcome = await retryWithBackoff(attempt, new Error("first"), {
        firstDelayMs: 1_000,
        maxDelayMs: 60_000,
        signal: AbortSignal.abort(),
        clock,
      });

      expect(outcome).toEqual({ kind: "stopped" });
      expect(ranAt).toEqual([]);
    });
  });
});

describe("RetryScope", () => {
  it("keeps retrying in the background until the attempt succeeds", async () => {
    await withTestClock(async (clock) => {
      const scope = new RetryScope({
        firstDelayMs: 1_000,
        maxDelayMs: 60_000,
        clock,
        logger: quiet,
      });
      const { attempt, ranAt } = refusing(clock, 1);
      const outcome = scope.retry(attempt, new Error("first"), "queue a job");

      await advance(clock, 1_000);
      await advance(clock, 2_000);

      expect(await outcome).toEqual({ kind: "succeeded", value: "job-1" });
      expect(ranAt).toEqual([1_000, 3_000]);
      await scope.dispose();
    });
  });

  it("runs an operation now and retries it in the background when refused", async () => {
    await withTestClock(async (clock) => {
      const scope = new RetryScope({ clock, logger: quiet });
      const { attempt, ranAt } = refusing(clock, 1);

      await scope.run(attempt, "queue a job");
      expect(ranAt).toEqual([0]);
      await advance(clock, 1_000);

      expect(ranAt).toEqual([0, 1_000]);
      await scope.dispose();
    });
  });

  it("keeps one retry per key, the latest superseding the pending one", async () => {
    await withTestClock(async (clock) => {
      const scope = new RetryScope({ clock, logger: quiet });
      const first = refusing(clock, 0);
      const second = refusing(clock, 0);
      const superseded = scope.retry(
        first.attempt,
        new Error("first"),
        "queue a job",
        "job",
      );
      const latest = scope.retry(
        second.attempt,
        new Error("first"),
        "queue a job",
        "job",
      );

      expect(await superseded).toEqual({ kind: "stopped" });
      await advance(clock, 1_000);
      expect(await latest).toEqual({ kind: "succeeded", value: "job-1" });
      expect(first.ranAt).toEqual([]);
      await scope.dispose();
    });
  });

  it("cancels the pending retry under a key", async () => {
    await withTestClock(async (clock) => {
      const scope = new RetryScope({ clock, logger: quiet });
      const { attempt, ranAt } = refusing(clock, 0);
      const outcome = scope.retry(
        attempt,
        new Error("first"),
        "queue a job",
        "job",
      );

      scope.cancel("job");
      scope.cancel("unknown");
      await advance(clock, 10_000);

      expect(await outcome).toEqual({ kind: "stopped" });
      expect(ranAt).toEqual([]);
      await scope.dispose();
    });
  });

  it("stops every retry it owns when disposed, and admits none after", async () => {
    await withTestClock(async (clock) => {
      const scope = new RetryScope({
        firstDelayMs: 1_000,
        maxDelayMs: 60_000,
        clock,
        logger: quiet,
      });
      const first = refusing(clock, 0);
      const second = refusing(clock, 0);
      const outcomes = [
        scope.retry(first.attempt, new Error("first"), "queue a job"),
        scope.retry(second.attempt, new Error("first"), "queue a job"),
      ];

      await scope.dispose();
      const late = refusing(clock, 0);
      const lateOutcome = scope.retry(
        late.attempt,
        new Error("first"),
        "queue a job",
      );
      await advance(clock, 10_000);

      expect(await Promise.all(outcomes)).toEqual([
        { kind: "stopped" },
        { kind: "stopped" },
      ]);
      expect(await lateOutcome).toEqual({ kind: "stopped" });
      expect([...first.ranAt, ...second.ranAt, ...late.ranAt]).toEqual([]);
    });
  });
});
