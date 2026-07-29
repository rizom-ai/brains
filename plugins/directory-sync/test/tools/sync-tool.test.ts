import { describe, expect, it, mock } from "bun:test";
import type { ToolContext } from "@brains/plugins";
import { createMockServicePluginContext } from "@brains/test-utils";
import { createDirectorySyncTools } from "../../src/tools";
import { createMockDirectorySync, createMockGitSync } from "../fixtures";

describe("directory_sync tool", () => {
  it("queues git-backed sync requests instead of pulling inline", async () => {
    const enqueue = mock(async () => "job-sync-request");
    const queueSyncBatch = mock(async () => ({
      batchId: "batch-1",
      operationCount: 1,
      exportOperationsCount: 0,
      importOperationsCount: 1,
      totalFiles: 1,
    }));
    const gitSync = createMockGitSync();
    const context = createMockServicePluginContext();
    const tools = createDirectorySyncTools(
      createMockDirectorySync({ queueSyncBatch }),
      { ...context, jobs: { ...context.jobs, enqueue } },
      "directory-sync",
      gitSync,
    );
    const syncTool = tools.find((tool) => tool.name === "directory_sync");
    if (!syncTool) throw new Error("Expected sync tool");

    const toolContext = {
      interfaceType: "web-chat",
      channelId: "channel-1",
      actor: { kind: "user", userId: "user-1" },
    } satisfies ToolContext;
    const result = await syncTool.handler({ action: "sync" }, toolContext);

    expect(result).toEqual({
      success: true,
      data: { jobId: "job-sync-request", status: "queued", gitPulled: true },
      message:
        "Sync queued: git pull and filesystem scan will run in the background",
    });
    expect(enqueue).toHaveBeenCalledWith({
      type: "sync-request",
      data: {
        source: "web-chat:channel-1",
        interfaceType: "web-chat",
        channelId: "channel-1",
      },
      toolContext: {
        interfaceType: "web-chat",
        channelId: "channel-1",
        actor: { kind: "user", userId: "user-1" },
      },
    });
    expect(gitSync.pull).not.toHaveBeenCalled();
    expect(queueSyncBatch).not.toHaveBeenCalled();
  });
});
