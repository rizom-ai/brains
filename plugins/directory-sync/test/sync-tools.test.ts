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
import { toolResultSchema, type Tool } from "@brains/plugins";
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
  const queueSyncBatchMock = mock(
    (): Promise<BatchResult | null> =>
      Promise.resolve({
        batchId: "batch-123",
        operationCount: 5,
        exportOperationsCount: 0,
        importOperationsCount: 5,
        totalFiles: 10,
      }),
  );
  const getStatusMock = mock(
    (): Promise<DirectorySyncStatus> => Promise.resolve(defaultStatus()),
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
  withLockCallCount: { value: number };
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
  const withLockCallCount = { value: 0 };

  return {
    gitSync: createBaseMockGS({
      pull: pullMock,
      getStatus: getStatusMock,
      withLock: async <T>(fn: () => Promise<T>): Promise<T> => {
        withLockCallCount.value++;
        return fn();
      },
    }),
    pullMock,
    getStatusMock,
    withLockCallCount,
  };
}

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
      data: parsed.data as Record<string, unknown>,
      message: parsed.message,
    };
  }
  return { success: false, error: parsed.error };
}

const toolContext = { interfaceType: "mcp" as const, userId: "test" };

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

  it("should call queueSyncBatch (non-blocking)", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory-sync_sync");

    await syncTool.handler({}, toolContext);

    expect(queueSyncBatchMock).toHaveBeenCalledTimes(1);
  });

  it("should use default cleanup behavior for manual sync batches", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory-sync_sync");

    await syncTool.handler({}, toolContext);

    expect(queueSyncBatchMock).toHaveBeenCalledWith(
      expect.anything(),
      "plugin:directory-sync",
      expect.objectContaining({ interfaceType: "mcp" }),
    );
  });

  it("should return batch info immediately", async () => {
    const { directorySync } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory-sync_sync");
    const result = parseToolResult(await syncTool.handler({}, toolContext));

    expect(result.success).toBe(true);
    expect(result.data?.["batchId"]).toBe("batch-123");
    expect(result.data?.["importOperations"]).toBe(5);
    expect(result.data?.["totalFiles"]).toBe(10);
  });

  it("should git pull before queuing imports", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();
    const { gitSync, pullMock } = createMockGitSync();

    const order: string[] = [];
    pullMock.mockImplementation(async () => {
      order.push("pull");
      return { files: [], alreadyUpToDate: true };
    });
    queueSyncBatchMock.mockImplementation(async () => {
      order.push("queueSyncBatch");
      return {
        batchId: "b",
        operationCount: 1,
        exportOperationsCount: 0,
        importOperationsCount: 1,
        totalFiles: 1,
      };
    });

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
      gitSync,
    );
    const syncTool = findTool(tools, "directory-sync_sync");
    await syncTool.handler({}, toolContext);

    expect(order).toEqual(["pull", "queueSyncBatch"]);
  });

  it("should skip git pull when no gitSync", async () => {
    const { directorySync } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory-sync_sync");
    const result = parseToolResult(await syncTool.handler({}, toolContext));

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
    const syncTool = findTool(tools, "directory-sync_sync");
    const result = parseToolResult(await syncTool.handler({}, toolContext));

    expect(result.success).toBe(true);
    expect(result.message).toContain("No files to sync");
  });

  it("should return success with gitPulled when no files but git configured", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();
    const { gitSync } = createMockGitSync();
    queueSyncBatchMock.mockResolvedValue(null);

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
      gitSync,
    );
    const syncTool = findTool(tools, "directory-sync_sync");
    const result = parseToolResult(await syncTool.handler({}, toolContext));

    expect(result.success).toBe(true);
    expect(result.data?.["gitPulled"]).toBe(true);
  });

  it("should return toolError when pull fails", async () => {
    const { directorySync } = createMockDirectorySync();
    const { gitSync, pullMock } = createMockGitSync();
    pullMock.mockRejectedValue(new Error("Network timeout"));

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
      gitSync,
    );
    const syncTool = findTool(tools, "directory-sync_sync");
    const result = parseToolResult(await syncTool.handler({}, toolContext));

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network timeout");
  });

  it("should return toolError when queueSyncBatch fails", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();
    queueSyncBatchMock.mockRejectedValue(new Error("DB connection lost"));

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory-sync_sync");
    const result = parseToolResult(await syncTool.handler({}, toolContext));

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
    const syncTool = findTool(tools, "directory-sync_sync");
    await syncTool.handler(
      {},
      { interfaceType: "discord", userId: "u1", channelId: "room-456" },
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
    const syncTool = findTool(tools, "directory-sync_sync");
    await syncTool.handler({}, { interfaceType: "mcp", userId: "u1" });

    expect(queueSyncBatchMock).toHaveBeenCalledWith(
      expect.anything(),
      "plugin:directory-sync",
      expect.anything(),
    );
  });

  it("should run pull and queueSyncBatch inside the same withLock call", async () => {
    const { directorySync, queueSyncBatchMock } = createMockDirectorySync();
    const { gitSync, pullMock, withLockCallCount } = createMockGitSync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
      gitSync,
    );
    const syncTool = findTool(tools, "directory-sync_sync");
    await syncTool.handler({}, toolContext);

    // withLock should be called exactly once (both pull and queue inside it)
    expect(withLockCallCount.value).toBe(1);
    // Both pull and queueSyncBatch should have been called
    expect(pullMock).toHaveBeenCalledTimes(1);
    expect(queueSyncBatchMock).toHaveBeenCalledTimes(1);
  });
});

describe("status tool", () => {
  let context: ServicePluginContext;

  beforeEach(() => {
    context = createMockServicePluginContext();
  });

  it("should omit git field when not configured", async () => {
    const { directorySync } = createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const statusTool = findTool(tools, "directory-sync_status");
    const result = parseToolResult(await statusTool.handler({}, toolContext));

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
    const statusTool = findTool(tools, "directory-sync_status");
    const result = parseToolResult(await statusTool.handler({}, toolContext));

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
    const statusTool = findTool(tools, "directory-sync_status");
    const result = parseToolResult(await statusTool.handler({}, toolContext));

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
    const statusTool = findTool(tools, "directory-sync_status");
    const result = parseToolResult(await statusTool.handler({}, toolContext));

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
    const statusTool = findTool(tools, "directory-sync_status");
    const result = parseToolResult(await statusTool.handler({}, toolContext));

    expect(result.success).toBe(false);
    expect(result.error).toContain("git not found");
  });
});
