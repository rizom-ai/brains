import { describe, it, expect, mock } from "bun:test";
import { setupInitialSync } from "../../src/lib/initial-sync";
import { createSilentLogger } from "@brains/test-utils";
import type { DirectorySync } from "../../src/lib/directory-sync";
import type { DirectorySyncConfig } from "../../src/types";
import type { GitSync } from "../../src/lib/git-sync";
import type { BatchResult } from "../../src/lib/batch-operations";

function createMockContext(): {
  context: Parameters<typeof setupInitialSync>[0];
  handlers: Map<string, (...args: unknown[]) => Promise<unknown>>;
} {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  return {
    context: {
      dataDir: "/tmp/test",
      messaging: {
        subscribe: (
          type: string,
          handler: (...args: unknown[]) => Promise<unknown>,
        ): (() => void) => {
          handlers.set(type, handler);
          return (): void => {
            handlers.delete(type);
          };
        },
        send: mock(async () => ({ success: true })),
      },
      jobs: {
        getStatus: mock(async () => null),
        getBatchStatus: mock(async () => ({
          status: "completed",
          completedOperations: 1,
          failedOperations: 0,
        })),
      },
    } as unknown as Parameters<typeof setupInitialSync>[0],
    handlers,
  };
}

function createMockDirectorySync(): DirectorySync & {
  queueSyncBatch: ReturnType<typeof mock>;
} {
  const queueSyncBatchMock = mock(
    async (): Promise<BatchResult | null> => null,
  );
  return {
    queueSyncBatch: queueSyncBatchMock,
    initializeDirectory: mock(async () => {}),
  } as unknown as DirectorySync & {
    queueSyncBatch: ReturnType<typeof mock>;
  };
}

function createMockGitSync(): GitSync & { pull: ReturnType<typeof mock> } {
  return {
    pull: mock(async () => ({ files: ["post/new.md"] })),
    commit: mock(async () => {}),
    push: mock(async () => {}),
    initialize: mock(async () => {}),
    hasRemote: (): boolean => true,
    getStatus: mock(async () => ({
      isRepo: true,
      hasChanges: false,
      ahead: 0,
      behind: 0,
      branch: "main",
      files: [],
    })),
    cleanup: (): void => {},
  } as unknown as GitSync & { pull: ReturnType<typeof mock> };
}

const baseConfig: DirectorySyncConfig = {
  autoSync: true,
  watchInterval: 1000,
  includeMetadata: true,
  initialSync: true,
  initialSyncDelay: 0,
  syncBatchSize: 10,
  syncPriority: 3,
  seedContent: false,
  deleteOnFileRemoval: true,
  syncInterval: 2,
  commitDebounce: 5000,
};

describe("setupInitialSync with git", () => {
  it("should call gitSync.pull() before queueSyncBatch()", async () => {
    const { context, handlers } = createMockContext();
    const ds = createMockDirectorySync();
    const gs = createMockGitSync();
    const callOrder: string[] = [];

    gs.pull = mock(async () => {
      callOrder.push("pull");
      return { files: [] };
    });
    ds.queueSyncBatch = mock(async () => {
      callOrder.push("queueSyncBatch");
      return null;
    });

    setupInitialSync(
      context,
      () => ds,
      baseConfig,
      "directory-sync",
      createSilentLogger(),
      gs,
    );

    const handler = handlers.get("system:plugins:ready");
    expect(handler).toBeDefined();
    if (handler) await handler();

    expect(callOrder).toEqual(["pull", "queueSyncBatch"]);
  });

  it("should call queueSyncBatch when gitSync is not provided", async () => {
    const { context, handlers } = createMockContext();
    const ds = createMockDirectorySync();

    setupInitialSync(
      context,
      () => ds,
      baseConfig,
      "directory-sync",
      createSilentLogger(),
    );

    const handler = handlers.get("system:plugins:ready");
    if (handler) await handler();

    expect(ds.queueSyncBatch).toHaveBeenCalledTimes(1);
  });

  it("should emit sync:initial:completed after sync", async () => {
    const { context, handlers } = createMockContext();
    const ds = createMockDirectorySync();
    const gs = createMockGitSync();

    setupInitialSync(
      context,
      () => ds,
      baseConfig,
      "directory-sync",
      createSilentLogger(),
      gs,
    );

    const handler = handlers.get("system:plugins:ready");
    if (handler) await handler();

    expect(context.messaging.send).toHaveBeenCalledWith(
      "sync:initial:completed",
      { success: true },
      { broadcast: true },
    );
  });
});
