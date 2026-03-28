import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createDirectorySyncTools } from "../src/tools";
import type { DirectorySync } from "../src/lib/directory-sync";
import type { GitSync } from "../src/lib/git-sync";
import type { ServicePluginContext } from "@brains/plugins";
import { createMockServicePluginContext } from "@brains/test-utils";
import { toolResultSchema, type Tool } from "@brains/plugins";

/**
 * Tests for the simplified sync tools.
 *
 * Critical: sync tool MUST be non-blocking.
 * It queues import jobs via queueSyncBatch and returns immediately.
 * It must NOT call fullSync (which blocks the event loop).
 */

function createMockDirectorySync() {
  const queueSyncBatchMock = mock(() =>
    Promise.resolve({
      batchId: "batch-123",
      operationCount: 5,
      exportOperationsCount: 0,
      importOperationsCount: 5,
      totalFiles: 10,
    }),
  );
  const fullSyncMock = mock(() =>
    Promise.resolve({ imported: 5, gitPulled: false, gitPushed: false }),
  );
  const getStatusMock = mock(() =>
    Promise.resolve({
      syncPath: "/data/brain",
      exists: true,
      watching: true,
      lastSync: new Date(),
      files: [],
      stats: { totalFiles: 0, byEntityType: {} },
    }),
  );

  return {
    directorySync: {
      queueSyncBatch: queueSyncBatchMock,
      fullSync: fullSyncMock,
      getStatus: getStatusMock,
    } as unknown as DirectorySync,
    queueSyncBatchMock,
    fullSyncMock,
  };
}

function createMockGitSync() {
  const pullMock = mock(() =>
    Promise.resolve({ files: [], alreadyUpToDate: true }),
  );
  return {
    gitSync: {
      pull: pullMock,
      withLock: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
      getStatus: mock(() =>
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
      ),
    } as unknown as GitSync,
    pullMock,
  };
}

function parseToolResult(raw: unknown): {
  success: true;
  data: Record<string, unknown>;
  message?: string | undefined;
} {
  const parsed = toolResultSchema.parse(raw);
  if (!parsed.success) {
    throw new Error(`Expected success result but got error: ${parsed.error}`);
  }
  return { ...parsed, data: parsed.data as Record<string, unknown> };
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

  it("should call queueSyncBatch, NOT fullSync", async () => {
    const { directorySync, queueSyncBatchMock, fullSyncMock } =
      createMockDirectorySync();

    const tools = createDirectorySyncTools(
      directorySync,
      context,
      "directory-sync",
    );
    const syncTool = findTool(tools, "directory-sync_sync");
    expect(syncTool).toBeDefined();

    await syncTool.handler({}, toolContext);

    expect(queueSyncBatchMock).toHaveBeenCalledTimes(1);
    expect(fullSyncMock).not.toHaveBeenCalled();
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
    expect(result.data["batchId"]).toBe("batch-123");
    expect(result.data["importOperations"]).toBe(5);
    expect(result.data["totalFiles"]).toBe(10);
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
    expect(result.data["gitPulled"]).toBe(false);
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
    expect(result.data["syncPath"]).toBe("/data/brain");
    expect(result.data["git"]).toBeUndefined();
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
    expect(result.data["git"]).toBeDefined();
  });
});
