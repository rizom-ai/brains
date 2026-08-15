import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createDirectorySyncTools } from "../src/tools";
import type {
  DirectorySyncStatus,
  IDirectorySync,
  IGitSync,
} from "../src/types";
import type { BatchResult } from "../src/lib/batch-operations";
import type { ServicePluginContext } from "@brains/plugins";
import { createMockServicePluginContext } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { toolResultSchema, type Tool, type ToolContext } from "@brains/plugins";
import {
  createMockDirectorySync as createBaseMockDS,
  createMockGitSync as createBaseMockGS,
} from "./fixtures";

function defaultStatus(
  overrides?: Partial<DirectorySyncStatus>,
): DirectorySyncStatus {
  return {
    syncPath: "/data/brain",
    exists: true,
    watching: true,
    lastSync: new Date(),
    files: [],
    stats: { totalFiles: 0, byEntityType: {} },
    ...overrides,
  };
}

function createMockDirectorySync(): {
  directorySync: IDirectorySync;
  queueSyncBatchMock: ReturnType<typeof mock>;
  getStatusMock: ReturnType<typeof mock>;
} {
  const queueSyncBatchMock = mock((): Promise<BatchResult | null> =>
    Promise.resolve({
      batchId: "batch-123",
      operationCount: 5,
      exportOperationsCount: 0,
      importOperationsCount: 5,
      totalFiles: 10,
    }),
  );
  const getStatusMock = mock((): Promise<DirectorySyncStatus> =>
    Promise.resolve(defaultStatus()),
  );

  return {
    directorySync: createBaseMockDS({
      queueSyncBatch: queueSyncBatchMock,
      getStatus: getStatusMock,
    }),
    queueSyncBatchMock,
    getStatusMock,
  };
}

function createMockGitSync(): {
  gitSync: IGitSync;
  pullMock: ReturnType<typeof mock>;
  getStatusMock: ReturnType<typeof mock>;
  commitAndPushMock: ReturnType<typeof mock>;
} {
  const pullMock = mock(() =>
    Promise.resolve({ files: [], alreadyUpToDate: true }),
  );
  const getStatusMock = mock(() =>
    Promise.resolve({
      isRepo: true,
      hasChanges: false,
      ahead: 0,
      behind: 0,
      branch: "main",
      lastCommit: "abc",
      remote: "origin",
      files: [],
    }),
  );
  const commitAndPushMock = mock(() =>
    Promise.resolve({ pushed: false, checkpoint: null }),
  );

  return {
    gitSync: createBaseMockGS({
      pull: pullMock,
      getStatus: getStatusMock,
      commitAndPush: commitAndPushMock,
    }),
    pullMock,
    getStatusMock,
    commitAndPushMock,
  };
}

const toolDataSchema = z.record(z.string(), z.unknown());

function parseToolResult(raw: unknown): {
  success: boolean;
  data?: Record<string, unknown> | undefined;
  error?: string | undefined;
  message?: string | undefined;
} {
  const parsed = toolResultSchema.parse(raw);
  if (parsed.success) {
    return {
      success: true,
      data:
        parsed.data === undefined
          ? undefined
          : toolDataSchema.parse(parsed.data),
      message: parsed.message,
    };
  }
  return { success: false, error: parsed.error };
}

const toolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "test" },
} satisfies ToolContext;

function findTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

describe("sync tool", () => {
  let context: ServicePluginContext;

  beforeEach(() => {
    context = createMockServicePluginContext();
  });

  it("registers one canonical directory_sync tool", () => {
    const { directorySync } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );

    expect(tools.map((tool) => tool.name)).toEqual(["directory_sync"]);
  });

  it("documents direct git sync and bare status routing", () => {
    const { directorySync } = createMockDirectorySync();
    const { gitSync } = createMockGitSync();
    const directoryTool = findTool(
      createDirectorySyncTools(
        directorySync,
        context,
        "directory-sync",
        gitSync,
      ),
      "directory_sync",
    );

    expect(directoryTool.description).toContain("'sync with git'");
    expect(directoryTool.description).toContain("never ask for those fields");
    expect(directoryTool.description).toContain("bare 'what is the status'");
  });

  it("routes sync and status actions through directory_sync", async () => {
    const { directorySync, queueSyncBatchMock, getStatusMock } =
      createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const directoryTool = findTool(tools, "directory_sync");

    const syncResult = parseToolResult(
      await directoryTool.handler({ action: "sync" }, toolContext),
    );
    expect(syncResult.success).toBe(true);
    expect(queueSyncBatchMock).toHaveBeenCalledTimes(1);

    const statusResult = parseToolResult(
      await directoryTool.handler({ action: "status" }, toolContext),
    );
    expect(statusResult.success).toBe(true);
    expect(getStatusMock).toHaveBeenCalledTimes(1);
  });

  it("routes history through directory_sync when git is configured", async () => {
    const { directorySync } = createMockDirectorySync();
    const { gitSync } = createMockGitSync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
      gitSync,
    );
    const directoryTool = findTool(tools, "directory_sync");

    const result = parseToolResult(
      await directoryTool.handler(
        { action: "history", entityType: "note", id: "alpha" },
        toolContext,
      ),
    );

    expect(result.success).toBe(true);
  });

  it("declares admin-only external side effects", () => {
    const { directorySync } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory_sync");

    expect(syncTool.visibility).toBe("admin");
    expect(syncTool.sideEffects).toBe("external");
  });

  it("preserves no-argument CLI sync invocation", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory_sync");

    await syncTool.handler({}, toolContext);

    expect(queueSyncBatchMock).toHaveBeenCalledTimes(1);
  });

  it("should call queueSyncBatch (non-blocking)", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory_sync");

    await syncTool.handler({ action: "sync" }, toolContext);

    expect(queueSyncBatchMock).toHaveBeenCalledTimes(1);
  });

  it("should return batch info immediately", async () => {
    const { directorySync } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory_sync");
    const result = parseToolResult(
      await syncTool.handler({ action: "sync" }, toolContext),
    );

    expect(result.success).toBe(true);
    expect(result.data?.["batchId"]).toBe("batch-123");
    expect(result.data?.["importOperations"]).toBe(5);
    expect(result.data?.["totalFiles"]).toBe(10);
  });

  it("should enqueue git pull plus sync work when git is configured", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();
    const { gitSync, pullMock } = createMockGitSync();
    const enqueueMock = mock(async () => "job-123");
    context = {
      ...context,
      jobs: { ...context.jobs, enqueue: enqueueMock },
    };

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
      gitSync,
    );
    const syncTool = findTool(tools, "directory_sync");
    const result = parseToolResult(
      await syncTool.handler({ action: "sync" }, toolContext),
    );

    expect(result.success).toBe(true);
    expect(result.data?.["jobId"]).toBe("job-123");
    expect(result.data?.["gitPulled"]).toBe(true);
    expect(result.message).toBe(
      "Sync queued: git pull and filesystem scan will run in the background",
    );
    expect(enqueueMock).toHaveBeenCalledWith({
      type: "sync-request",
      data: {
        source: "plugin:directory-sync",
        interfaceType: "mcp",
        channelId: undefined,
      },
      toolContext,
    });
    expect(pullMock).not.toHaveBeenCalled();
    expect(queueSyncBatchMock).not.toHaveBeenCalled();
  });

  it("should skip git pull when no gitSync", async () => {
    const { directorySync } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory_sync");
    const result = parseToolResult(
      await syncTool.handler({ action: "sync" }, toolContext),
    );

    expect(result.success).toBe(true);
    expect(result.data?.["gitPulled"]).toBe(false);
  });

  it("should return success when no files to sync", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();
    queueSyncBatchMock.mockResolvedValue(null);

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory_sync");
    const result = parseToolResult(
      await syncTool.handler({ action: "sync" }, toolContext),
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("No files to sync");
  });

  it("should return success with jobId when git is configured", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();
    const { gitSync } = createMockGitSync();
    const enqueueMock = mock(async () => "job-123");
    context = {
      ...context,
      jobs: { ...context.jobs, enqueue: enqueueMock },
    };
    queueSyncBatchMock.mockResolvedValue(null);

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
      gitSync,
    );
    const syncTool = findTool(tools, "directory_sync");
    const result = parseToolResult(
      await syncTool.handler({ action: "sync" }, toolContext),
    );

    expect(result.success).toBe(true);
    expect(result.data?.["jobId"]).toBe("job-123");
    expect(result.data?.["gitPulled"]).toBe(true);
    expect(queueSyncBatchMock).not.toHaveBeenCalled();
  });

  it("should return toolError when enqueueing a git-backed sync fails", async () => {
    const { directorySync } = createMockDirectorySync();
    const { gitSync } = createMockGitSync();
    context = {
      ...context,
      jobs: {
        ...context.jobs,
        enqueue: mock(async () => {
          throw new Error("Queue unavailable");
        }),
      },
    };

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
      gitSync,
    );
    const syncTool = findTool(tools, "directory_sync");
    const result = parseToolResult(
      await syncTool.handler({ action: "sync" }, toolContext),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Queue unavailable");
  });

  it("should return toolError when queueSyncBatch fails", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();
    queueSyncBatchMock.mockRejectedValue(new Error("DB connection lost"));

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory_sync");
    const result = parseToolResult(
      await syncTool.handler({ action: "sync" }, toolContext),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("DB connection lost");
  });

  it("should forward interfaceType and channelId to batch metadata", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory_sync");
    await syncTool.handler(
      { action: "sync" },
      {
        interfaceType: "discord",
        actor: { kind: "user", userId: "u1" },
        channelId: "room-456",
      },
    );

    expect(queueSyncBatchMock).toHaveBeenCalledWith(
      expect.anything(),
      "discord:room-456",
      expect.objectContaining({
        interfaceType: "discord",
        channelId: "room-456",
      }),
    );
  });

  it("should use plugin fallback source when no channelId", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory_sync");
    await syncTool.handler(
      { action: "sync" },
      { interfaceType: "mcp", actor: { kind: "user", userId: "u1" } },
    );

    expect(queueSyncBatchMock).toHaveBeenCalledWith(
      expect.anything(),
      "plugin:directory-sync",
      expect.anything(),
    );
  });

  it("should leave git work and batch queueing to the sync-request job", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();
    const { gitSync, pullMock, commitAndPushMock } = createMockGitSync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
      gitSync,
    );
    const syncTool = findTool(tools, "directory_sync");
    await syncTool.handler({ action: "sync" }, toolContext);

    expect(commitAndPushMock).not.toHaveBeenCalled();
    expect(pullMock).not.toHaveBeenCalled();
    expect(queueSyncBatchMock).not.toHaveBeenCalled();
  });
});

describe("status tool", () => {
  let context: ServicePluginContext;

  beforeEach(() => {
    context = createMockServicePluginContext();
  });

  it("declares admin-only external semantics for the consolidated action tool", () => {
    const { directorySync } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const statusTool = findTool(tools, "directory_sync");

    expect(statusTool.visibility).toBe("admin");
    expect(statusTool.sideEffects).toBe("external");
  });

  it("should omit git field when not configured", async () => {
    const { directorySync } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const statusTool = findTool(tools, "directory_sync");
    const result = parseToolResult(
      await statusTool.handler({ action: "status" }, toolContext),
    );

    expect(result.success).toBe(true);
    expect(result.data?.["syncPath"]).toBe("/data/brain");
    expect(result.data?.["git"]).toBeUndefined();
  });

  it("should include git info when configured", async () => {
    const { directorySync } = createMockDirectorySync();
    const { gitSync } = createMockGitSync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
      gitSync,
    );
    const statusTool = findTool(tools, "directory_sync");
    const result = parseToolResult(
      await statusTool.handler({ action: "status" }, toolContext),
    );

    expect(result.success).toBe(true);
    expect(result.data?.["git"]).toBeDefined();
  });

  it("should handle lastSync being undefined (never synced)", async () => {
    const { directorySync, getStatusMock } = createMockDirectorySync();
    getStatusMock.mockResolvedValue(
      defaultStatus({ watching: false, lastSync: undefined }),
    );

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const statusTool = findTool(tools, "directory_sync");
    const result = parseToolResult(
      await statusTool.handler({ action: "status" }, toolContext),
    );

    expect(result.success).toBe(true);
    expect(result.data?.["lastSync"]).toBeUndefined();
  });

  it("should return toolError when getStatus throws", async () => {
    const { directorySync, getStatusMock } = createMockDirectorySync();
    getStatusMock.mockRejectedValue(new Error("Disk read failed"));

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const statusTool = findTool(tools, "directory_sync");
    const result = parseToolResult(
      await statusTool.handler({ action: "status" }, toolContext),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Disk read failed");
  });

  it("should return toolError when git getStatus throws", async () => {
    const { directorySync } = createMockDirectorySync();
    const { gitSync, getStatusMock: gitStatusMock } = createMockGitSync();
    gitStatusMock.mockRejectedValue(new Error("git not found"));

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
      gitSync,
    );
    const statusTool = findTool(tools, "directory_sync");
    const result = parseToolResult(
      await statusTool.handler({ action: "status" }, toolContext),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("git not found");
  });
});
