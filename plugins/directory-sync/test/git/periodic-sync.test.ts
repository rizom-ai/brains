import { describe, it, expect, mock, afterEach } from "bun:test";
import { setupPeriodicGitSync } from "../../src/lib/git-periodic-sync";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
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

describe("setupPeriodicGitSync", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
  });

  it("should wait one complete interval before the first cycle", async () => {
    const pullMock = mock(async (): Promise<PullResult> => ({
      files: ["a.md"],
    }));

    cleanup = setupPeriodicGitSync(
      createMockGitSync({ pull: pullMock }),
      createMockDirectorySync(),
      createMockServicePluginContext(),
      0.002,
      createSilentLogger(),
    );

    expect(pullMock).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pullMock).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(pullMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("should call pull and queueSyncBatch on each interval", async () => {
    const pullMock = mock(async (): Promise<PullResult> => ({
      files: ["a.md"],
    }));
    const queueSyncBatchMock = mock(
      async (): Promise<BatchResult | null> => emptyBatchResult,
    );

    cleanup = setupPeriodicGitSync(
      createMockGitSync({ pull: pullMock }),
      createMockDirectorySync({ queueSyncBatch: queueSyncBatchMock }),
      createMockServicePluginContext(),
      0.001,
      createSilentLogger(),
    );

    await new Promise((r) => setTimeout(r, 150));

    expect(pullMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(queueSyncBatchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("should skip queueSyncBatch when pull returns no files", async () => {
    const queueSyncBatchMock = mock(
      async (): Promise<BatchResult | null> => emptyBatchResult,
    );

    cleanup = setupPeriodicGitSync(
      createMockGitSync({
        pull: mock(async (): Promise<PullResult> => ({ files: [] })),
      }),
      createMockDirectorySync({ queueSyncBatch: queueSyncBatchMock }),
      createMockServicePluginContext(),
      0.001,
      createSilentLogger(),
    );

    await new Promise((r) => setTimeout(r, 150));

    expect(queueSyncBatchMock).not.toHaveBeenCalled();
  });

  it("should not call sync() directly (non-blocking)", async () => {
    const syncMock = mock(async () => {
      throw new Error("sync() should not be called — use queueSyncBatch");
    });
    const queueSyncBatchMock = mock(
      async (): Promise<BatchResult | null> => emptyBatchResult,
    );

    cleanup = setupPeriodicGitSync(
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
    );

    await new Promise((r) => setTimeout(r, 150));

    expect(syncMock).not.toHaveBeenCalled();
    expect(queueSyncBatchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("should not start when intervalMinutes is 0", () => {
    const pullMock = mock(async (): Promise<PullResult> => ({ files: [] }));

    cleanup = setupPeriodicGitSync(
      createMockGitSync({ pull: pullMock }),
      createMockDirectorySync(),
      createMockServicePluginContext(),
      0,
      createSilentLogger(),
    );

    expect(pullMock).not.toHaveBeenCalled();
  });

  it("should stop when cleanup is called", async () => {
    const pullMock = mock(async (): Promise<PullResult> => ({ files: [] }));

    cleanup = setupPeriodicGitSync(
      createMockGitSync({ pull: pullMock }),
      createMockDirectorySync(),
      createMockServicePluginContext(),
      0.001,
      createSilentLogger(),
    );

    cleanup();

    const callsBefore = pullMock.mock.calls.length;
    await new Promise((r) => setTimeout(r, 100));

    expect(pullMock.mock.calls.length).toBe(callsBefore);
  });

  it("currently returns from cleanup before an active cycle settles", async () => {
    const pullStarted = deferred();
    const releasePull = deferred();
    const cycleFinished = deferred();
    const queueSyncBatchMock = mock(async (): Promise<BatchResult | null> => {
      cycleFinished.resolve();
      return emptyBatchResult;
    });

    cleanup = setupPeriodicGitSync(
      createMockGitSync({
        pull: mock(async (): Promise<PullResult> => {
          pullStarted.resolve();
          await releasePull.promise;
          return { files: ["a.md"] };
        }),
      }),
      createMockDirectorySync({ queueSyncBatch: queueSyncBatchMock }),
      createMockServicePluginContext(),
      0.001,
      createSilentLogger(),
    );

    await pullStarted.promise;
    cleanup();
    expect(queueSyncBatchMock).not.toHaveBeenCalled();

    releasePull.resolve();
    await cycleFinished.promise;
    expect(queueSyncBatchMock).toHaveBeenCalledTimes(1);
  });

  it("should not overlap cycles", async () => {
    let concurrentCalls = 0;
    let maxConcurrent = 0;

    const slowPull = mock(async (): Promise<PullResult> => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await new Promise((r) => setTimeout(r, 80));
      concurrentCalls--;
      return { files: ["a.md"] };
    });

    cleanup = setupPeriodicGitSync(
      createMockGitSync({ pull: slowPull }),
      createMockDirectorySync({
        queueSyncBatch: mock(
          async (): Promise<BatchResult | null> => emptyBatchResult,
        ),
      }),
      createMockServicePluginContext(),
      0.001,
      createSilentLogger(),
    );

    await new Promise((r) => setTimeout(r, 300));

    expect(maxConcurrent).toBe(1);
  });
});
