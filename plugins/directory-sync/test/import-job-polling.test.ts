import { describe, expect, it, mock } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { ProgressReporter } from "@brains/utils/progress";
import {
  createMockEntityService,
  createSilentLogger,
} from "@brains/test-utils";
import { waitForImportJobs } from "../src/lib/import-job-polling";
import type { ProgressNotification } from "@brains/utils/progress";

function deferred(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

function createReporter(
  notifications: ProgressNotification[],
): ProgressReporter {
  const reporter = ProgressReporter.from(async (notification) => {
    notifications.push(notification);
  });
  if (!reporter) throw new Error("Failed to create progress reporter");
  return reporter;
}

function yieldToFibers(): Effect.Effect<void> {
  return Effect.yieldNow().pipe(Effect.andThen(Effect.yieldNow()));
}

describe("waitForImportJobs", () => {
  it("polls immediately, preserves cadence, and reports 50-55% progress", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const entityService = createMockEntityService();
        let round = 0;
        const status = mock(async (id: string) => {
          if (id === "one") round++;
          if (round === 1) return { status: "pending" as const };
          if (round === 2 && id === "two") {
            return { status: "pending" as const };
          }
          return { status: "completed" as const };
        });
        entityService.getAsyncJobStatus = status;
        const notifications: ProgressNotification[] = [];

        const waiting = waitForImportJobs({
          jobIds: ["one", "two"],
          entityService,
          reporter: createReporter(notifications),
          logger: createSilentLogger(),
          clock,
        });
        yield* yieldToFibers();
        expect(status).toHaveBeenCalledTimes(2);

        yield* TestClock.adjust(499);
        yield* yieldToFibers();
        expect(status).toHaveBeenCalledTimes(2);

        yield* TestClock.adjust(1);
        yield* yieldToFibers();
        expect(status).toHaveBeenCalledTimes(4);

        yield* TestClock.adjust(500);
        yield* Effect.promise(() => waiting);
        expect(status).toHaveBeenCalledTimes(6);
        expect(notifications).toEqual([
          { progress: 50, message: "Processing 0/2 entities" },
          { progress: 53, message: "Processing 1/2 entities" },
        ]);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("does not overlap status attempts", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const entityService = createMockEntityService();
        const firstStarted = deferred();
        const releaseFirst = deferred();
        let calls = 0;
        const status = mock(async () => {
          calls++;
          if (calls === 1) {
            firstStarted.resolve();
            await releaseFirst.promise;
            return { status: "pending" as const };
          }
          return { status: "completed" as const };
        });
        entityService.getAsyncJobStatus = status;

        const waiting = waitForImportJobs({
          jobIds: ["one"],
          entityService,
          reporter: createReporter([]),
          logger: createSilentLogger(),
          clock,
        });
        yield* Effect.promise(() => firstStarted.promise);
        yield* TestClock.adjust(10_000);
        yield* yieldToFibers();
        expect(status).toHaveBeenCalledTimes(1);

        releaseFirst.resolve();
        yield* yieldToFibers();
        yield* TestClock.adjust(500);
        yield* Effect.promise(() => waiting);
        expect(status).toHaveBeenCalledTimes(2);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("preserves the five-minute timeout boundary", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const entityService = createMockEntityService();
        const status = mock(async () => ({ status: "pending" as const }));
        entityService.getAsyncJobStatus = status;
        const waiting = waitForImportJobs({
          jobIds: ["one"],
          entityService,
          reporter: createReporter([]),
          logger: createSilentLogger(),
          clock,
        });
        let settled = false;
        void waiting.then(() => {
          settled = true;
        });
        yield* yieldToFibers();

        yield* TestClock.adjust(300_000);
        yield* yieldToFibers();
        expect(settled).toBe(false);

        yield* TestClock.adjust(500);
        yield* Effect.promise(() => waiting);
        expect(settled).toBe(true);
        // Immediate attempt + 600 fixed 500ms ticks + the timeout check.
        expect(status).toHaveBeenCalledTimes(602);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("preserves status lookup error identity", async () => {
    const entityService = createMockEntityService();
    const original = new Error("job database unavailable");
    entityService.getAsyncJobStatus = mock(async () => {
      throw original;
    });

    try {
      await waitForImportJobs({
        jobIds: ["one"],
        entityService,
        reporter: createReporter([]),
        logger: createSilentLogger(),
      });
      throw new Error("Expected polling failure");
    } catch (error) {
      expect(error).toBe(original);
    }
  });
});
