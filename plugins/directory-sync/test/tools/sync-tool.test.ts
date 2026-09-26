import { describe, expect, it, mock } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { syncRequestJob } from "../../src/jobs";
import { requestDirectorySync } from "../../src/lib/request-directory-sync";
import { createMockDirectorySync, createMockGitSync } from "../fixtures";
import { hostFor } from "../helpers/install";

/**
 * A sync request with git configured queues the pull-and-scan as one job
 * rather than pulling inline; the job carries where the request came from,
 * and the runtime records who made it.
 */
describe("a git-backed sync request", () => {
  it("files the sync-request job instead of pulling inline", async () => {
    const enqueue = mock(async () => ({
      id: "job-sync-request",
      status: async (): Promise<null> => null,
    }));
    const queueSyncBatch = mock(async () => ({
      batchId: "batch-1",
      operationCount: 1,
      exportOperationsCount: 0,
      importOperationsCount: 1,
      totalFiles: 1,
    }));
    const gitSync = createMockGitSync();
    const base = await hostFor(createMockShell());
    const host = { ...base, jobs: { ...base.jobs, enqueue } };

    const result = await requestDirectorySync({
      host,
      directorySync: createMockDirectorySync({ queueSyncBatch }),
      source: "web-chat:channel-1",
      interfaceType: "web-chat",
      channelId: "channel-1",
      gitSync,
    });

    expect(result).toEqual({
      gitPulled: true,
      jobId: "job-sync-request",
      status: "queued",
    });
    expect(enqueue).toHaveBeenCalledWith(syncRequestJob, {
      source: "web-chat:channel-1",
      runId: undefined,
      interfaceType: "web-chat",
      channelId: "channel-1",
    });
    expect(gitSync.pull).not.toHaveBeenCalled();
    expect(queueSyncBatch).not.toHaveBeenCalled();
  });

  it("scans the filesystem directly when there is no git", async () => {
    const queueSyncBatch = mock(async () => ({
      batchId: "batch-1",
      operationCount: 2,
      exportOperationsCount: 0,
      importOperationsCount: 2,
      totalFiles: 2,
    }));
    const host = await hostFor(createMockShell());

    const result = await requestDirectorySync({
      host,
      directorySync: createMockDirectorySync({ queueSyncBatch }),
      source: "plugin:directory-sync",
    });

    expect(result).toMatchObject({
      gitPulled: false,
      status: "queued",
      batchId: "batch-1",
      importOperationsCount: 2,
    });
    expect(queueSyncBatch).toHaveBeenCalledWith(host, "plugin:directory-sync", {
      interfaceType: undefined,
      channelId: undefined,
    });
  });
});
