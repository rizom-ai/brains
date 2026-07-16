import { describe, expect, it, mock } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
import { setupPeriodicGitSync } from "../../src/lib/git-periodic-sync";
import { DirectorySyncRuntime } from "../../src/lib/directory-sync-runtime";
import type { PullResult } from "../../src/lib/git-sync";
import type { BatchResult } from "../../src/lib/batch-operations";
import { createMockDirectorySync, createMockGitSync } from "../fixtures";

const emptyBatchResult: BatchResult = {
  batchId: "batch-1",
  operationCount: 1,
  exportOperationsCount: 0,
  importOperationsCount: 1,
  totalFiles: 3,
};

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

function yieldToFibers(): Effect.Effect<void> {
  return Effect.yieldNow().pipe(Effect.andThen(Effect.yieldNow()));
}

describe("setupPeriodicGitSync", () => {
  it("waits one complete interval and runs at fixed cadence", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const runtime = new DirectorySyncRuntime({ clock });
        const pullMock = mock(async (): Promise<PullResult> => ({ files: [] }));

        setupPeriodicGitSync(
          createMockGitSync({ pull: pullMock }),
          createMockDirectorySync(),
          createMockServicePluginContext(),
          0.001,
          createSilentLogger(),
          runtime,
        );

        yield* TestClock.adjust(59);
        yield* yieldToFibers();
        expect(pullMock).not.toHaveBeenCalled();

        yield* TestClock.adjust(1);
        yield* yieldToFibers();
        expect(pullMock).toHaveBeenCalledTimes(1);

        yield* TestClock.adjust(60);
        yield* yieldToFibers();
        expect(pullMock).toHaveBeenCalledTimes(2);
        yield* Effect.promise(() => runtime.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("queues imports only when pull returns changed files", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const runtime = new DirectorySyncRuntime({ clock });
        const queueSyncBatchMock = mock(
          async (): Promise<BatchResult | null> => emptyBatchResult,
        );
        const pullMock = mock(async (): Promise<PullResult> => ({
          files: ["a.md"],
        }));

        setupPeriodicGitSync(
          createMockGitSync({ pull: pullMock }),
          createMockDirectorySync({ queueSyncBatch: queueSyncBatchMock }),
          createMockServicePluginContext(),
          0.001,
          createSilentLogger(),
          runtime,
        );
        yield* TestClock.adjust(60);
        yield* yieldToFibers();
        expect(queueSyncBatchMock).toHaveBeenCalledTimes(1);

        pullMock.mockImplementation(async () => ({ files: [] }));
        yield* TestClock.adjust(60);
        yield* yieldToFibers();
        expect(queueSyncBatchMock).toHaveBeenCalledTimes(1);
        yield* Effect.promise(() => runtime.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("uses queueSyncBatch instead of blocking sync", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const runtime = new DirectorySyncRuntime({ clock });
        const syncMock = mock(async () => {
          throw new Error("sync() should not be called");
        });
        const queueSyncBatchMock = mock(
          async (): Promise<BatchResult | null> => emptyBatchResult,
        );

        setupPeriodicGitSync(
          createMockGitSync({
            pull: mock(async (): Promise<PullResult> => ({ files: ["a.md"] })),
          }),
          createMockDirectorySync({
            sync: syncMock,
            queueSyncBatch: queueSyncBatchMock,
          }),
          createMockServicePluginContext(),
          0.001,
          createSilentLogger(),
          runtime,
        );
        yield* TestClock.adjust(60);
        yield* yieldToFibers();

        expect(syncMock).not.toHaveBeenCalled();
        expect(queueSyncBatchMock).toHaveBeenCalledTimes(1);
        yield* Effect.promise(() => runtime.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("does not schedule a disabled interval", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const runtime = new DirectorySyncRuntime({ clock });
        const pullMock = mock(async (): Promise<PullResult> => ({ files: [] }));

        setupPeriodicGitSync(
          createMockGitSync({ pull: pullMock }),
          createMockDirectorySync(),
          createMockServicePluginContext(),
          0,
          createSilentLogger(),
          runtime,
        );
        yield* TestClock.adjust(1_000);
        yield* yieldToFibers();

        expect(pullMock).not.toHaveBeenCalled();
        yield* Effect.promise(() => runtime.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("stops future cycles and drains an active cycle on close", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const runtime = new DirectorySyncRuntime({ clock });
        const pullStarted = deferred();
        const releasePull = deferred();
        const queueSyncBatchMock = mock(
          async (): Promise<BatchResult | null> => emptyBatchResult,
        );
        const pullMock = mock(async (): Promise<PullResult> => {
          pullStarted.resolve();
          await releasePull.promise;
          return { files: ["a.md"] };
        });

        setupPeriodicGitSync(
          createMockGitSync({ pull: pullMock }),
          createMockDirectorySync({ queueSyncBatch: queueSyncBatchMock }),
          createMockServicePluginContext(),
          0.001,
          createSilentLogger(),
          runtime,
        );
        yield* TestClock.adjust(60);
        yield* Effect.promise(() => pullStarted.promise);

        let closeSettled = false;
        const closing = runtime.close().then(() => {
          closeSettled = true;
        });
        yield* yieldToFibers();
        expect(closeSettled).toBe(false);

        releasePull.resolve();
        yield* Effect.promise(() => closing);
        expect(queueSyncBatchMock).toHaveBeenCalledTimes(1);

        yield* TestClock.adjust(600);
        yield* yieldToFibers();
        expect(pullMock).toHaveBeenCalledTimes(1);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("does not overlap cycles", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const runtime = new DirectorySyncRuntime({ clock });
        const releaseFirst = deferred();
        const firstFinished = deferred();
        let calls = 0;
        const pullMock = mock(async (): Promise<PullResult> => {
          calls++;
          if (calls === 1) await releaseFirst.promise;
          return { files: ["a.md"] };
        });
        const queueSyncBatchMock = mock(
          async (): Promise<BatchResult | null> => {
            firstFinished.resolve();
            return emptyBatchResult;
          },
        );

        setupPeriodicGitSync(
          createMockGitSync({ pull: pullMock }),
          createMockDirectorySync({ queueSyncBatch: queueSyncBatchMock }),
          createMockServicePluginContext(),
          0.001,
          createSilentLogger(),
          runtime,
        );
        yield* TestClock.adjust(60);
        yield* yieldToFibers();
        expect(pullMock).toHaveBeenCalledTimes(1);

        yield* TestClock.adjust(60);
        yield* yieldToFibers();
        expect(pullMock).toHaveBeenCalledTimes(1);

        releaseFirst.resolve();
        yield* Effect.promise(() => firstFinished.promise);
        yield* TestClock.adjust(60);
        yield* yieldToFibers();
        expect(pullMock).toHaveBeenCalledTimes(2);
        yield* Effect.promise(() => runtime.close());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
