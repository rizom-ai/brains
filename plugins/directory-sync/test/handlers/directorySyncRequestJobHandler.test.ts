import { describe, expect, it, mock } from "bun:test";
import {
  createMockProgressReporter,
  createMockServicePluginContext,
  createSilentLogger,
} from "@brains/test-utils";
import { DirectorySyncRequestJobHandler } from "../../src/handlers/directorySyncRequestJobHandler";
import type { IGitSync } from "../../src/types";
import { createMockDirectorySync, createMockGitSync } from "../fixtures";

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
    const pull = mock(async () => {
      calls.push("pull");
      return { files: ["test.md"] };
    });
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
    const context = createMockServicePluginContext();
    const handler = new DirectorySyncRequestJobHandler(
      createSilentLogger("test"),
      context,
      createMockDirectorySync({ queueSyncBatch }),
      createMockGitSync({ withLock, pull }),
    );

    const result = await handler.process(
      {
        source: "web-chat:channel-1",
        interfaceType: "web-chat",
        channelId: "channel-1",
      },
      "root-job-1",
      createMockProgressReporter(),
    );

    expect(calls).toEqual(["lock:start", "pull", "queue", "lock:end"]);
    expect(queueSyncBatch).toHaveBeenCalledWith(context, "web-chat:channel-1", {
      rootJobId: "root-job-1",
      interfaceType: "web-chat",
      channelId: "channel-1",
    });
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
      createMockDirectorySync({ queueSyncBatch: mock(async () => null) }),
      createMockGitSync({ pull: mock(async () => ({ files: [] })) }),
    );

    const result = await handler.process(
      { source: "plugin:directory-sync" },
      "root-job-1",
      createMockProgressReporter(),
    );

    expect(result).toEqual({ gitPulled: true, batchQueued: false });
  });
});
