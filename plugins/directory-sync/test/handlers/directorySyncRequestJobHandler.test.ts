import { describe, expect, it, mock } from "bun:test";
import {
  createMockProgressReporter,
  createMockServicePluginContext,
  createSilentLogger,
} from "@brains/test-utils";
import { DirectorySyncRequestJobHandler } from "../../src/handlers/directorySyncRequestJobHandler";
import type { IGitSync } from "../../src/types";
import { createMockDirectorySync, createMockGitSync } from "../fixtures";

function createReconciliation(): ConstructorParameters<
  typeof DirectorySyncRequestJobHandler
>[4] {
  return {
    pullAndQueue: (options) =>
      options.gitSync.withLock(async () => {
        const pull = await options.gitSync.pull(
          options.signal,
          options.onGitProgress,
        );
        await options.directorySync.recordPendingPullDeletes(
          pull.deletedFiles ?? [],
        );
        if (pull.files.length === 0) {
          return {
            mode: "incremental",
            files: [],
            deletedFiles: [],
            batch: null,
            checkpointAdvanced: true,
          };
        }
        const batch = await options.directorySync.queueSyncBatch(
          options.context,
          options.source,
          options.metadata,
          pull.files,
          pull.deletedFiles,
        );
        if (batch) options.directorySync.suppressWatchPaths(pull.files);
        return {
          mode: "incremental",
          files: pull.files,
          deletedFiles: pull.deletedFiles ?? [],
          batch,
          checkpointAdvanced: batch !== null,
        };
      }),
  };
}

describe("DirectorySyncRequestJobHandler", () => {
  it("pulls and queues the sync batch under the git lock", async () => {
    const calls: string[] = [];
    const withLock: IGitSync["withLock"] = async <T>(
      fn: () => Promise<T>,
    ): Promise<T> => {
      calls.push("lock:start");
      const result = await fn();
      calls.push("lock:end");
      return result;
    };
    const progress = mock(() => {});
    const createProgressObserver = mock((runId: string) => {
      expect(runId).toBe("run-1");
      return progress;
    });
    const pull = mock(
      async (_signal?: AbortSignal, onProgress?: () => void) => {
        calls.push("pull");
        onProgress?.();
        return {
          files: ["test.md", "deleted.md"],
          deletedFiles: ["deleted.md"],
        };
      },
    );
    const queueSyncBatch = mock(async () => {
      calls.push("queue");
      return {
        batchId: "batch-1",
        operationCount: 1,
        exportOperationsCount: 0,
        importOperationsCount: 1,
        totalFiles: 1,
      };
    });
    const recordPendingPullDeletes = mock(async () => {});
    const suppressWatchPaths = mock(() => {});
    const context = createMockServicePluginContext();
    const handler = new DirectorySyncRequestJobHandler(
      createSilentLogger("test"),
      context,
      () =>
        createMockDirectorySync({
          queueSyncBatch,
          recordPendingPullDeletes,
          suppressWatchPaths,
        }),
      () => createMockGitSync({ withLock, pull }),
      createReconciliation(),
      { createProgressObserver } as never,
    );

    const result = await handler.process(
      {
        source: "web-chat:channel-1",
        runId: "run-1",
        interfaceType: "web-chat",
        channelId: "channel-1",
      },
      "root-job-1",
      createMockProgressReporter(),
    );

    expect(calls).toEqual(["lock:start", "pull", "queue", "lock:end"]);
    expect(createProgressObserver).toHaveBeenCalledWith("run-1");
    expect(progress).toHaveBeenCalledTimes(2);
    expect(recordPendingPullDeletes).toHaveBeenCalledWith(["deleted.md"]);
    expect(queueSyncBatch).toHaveBeenCalledWith(
      context,
      "web-chat:channel-1",
      {
        rootJobId: "root-job-1",
        interfaceType: "web-chat",
        channelId: "channel-1",
      },
      ["test.md", "deleted.md"],
      ["deleted.md"],
    );
    expect(suppressWatchPaths).toHaveBeenCalledWith(["test.md", "deleted.md"]);
    expect(result).toEqual({
      gitPulled: true,
      batchQueued: true,
      batchId: "batch-1",
      importOperations: 1,
      totalFiles: 1,
    });
  });

  it("reports no queued batch when pulled content has no sync changes", async () => {
    const handler = new DirectorySyncRequestJobHandler(
      createSilentLogger("test"),
      createMockServicePluginContext(),
      () => createMockDirectorySync({ queueSyncBatch: mock(async () => null) }),
      () => createMockGitSync({ pull: mock(async () => ({ files: [] })) }),
      createReconciliation(),
    );

    const result = await handler.process(
      { source: "plugin:directory-sync" },
      "root-job-1",
      createMockProgressReporter(),
    );

    expect(result).toEqual({ gitPulled: true, batchQueued: false });
  });
});
