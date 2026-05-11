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

describe("setupPeriodicGitSync", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
  });

  it("should call pull and queueSyncBatch on each interval", async () => {
    const pullMock = mock(
      async (): Promise<PullResult> => ({ files: ["a.md"] }),
    );
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

  it("should use default cleanup behavior for periodic sync batches", async () => {
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

    expect(queueSyncBatchMock).toHaveBeenCalledWith(
      expect.anything(),
      "periodic-sync",
    );
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
        pull: mock(async (): Promise<PullResult> => ({ files: [] })),
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
