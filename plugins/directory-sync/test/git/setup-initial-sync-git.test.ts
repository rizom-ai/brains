import { describe, it, expect, mock } from "bun:test";
import { setupInitialSync } from "../../src/lib/initial-sync";
import { createSilentLogger } from "@brains/test-utils";
import type { DirectorySyncConfig } from "../../src/types";
import {
  createMockDirectorySync,
  createMockGitSync,
  emptyExportResult,
  emptyImportResult,
} from "../fixtures";

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
  it("should call gitSync.pull() before sync()", async () => {
    const { context, handlers } = createMockContext();
    const callOrder: string[] = [];

    const ds = createMockDirectorySync({
      sync: mock(async () => {
        callOrder.push("sync");
        return {
          export: emptyExportResult(),
          import: emptyImportResult(),
          duration: 0,
        };
      }),
    });
    const gs = createMockGitSync({
      pull: mock(async () => {
        callOrder.push("pull");
        return { files: [] };
      }),
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

    expect(callOrder).toEqual(["pull", "sync"]);
  });

  it("should call sync when gitSync is not provided", async () => {
    const { context, handlers } = createMockContext();
    const syncMock = mock(async () => ({
      export: emptyExportResult(),
      import: emptyImportResult(),
      duration: 0,
    }));
    const ds = createMockDirectorySync({ sync: syncMock });

    setupInitialSync(
      context,
      () => ds,
      baseConfig,
      "directory-sync",
      createSilentLogger(),
    );

    const handler = handlers.get("system:plugins:ready");
    if (handler) await handler();

    expect(syncMock).toHaveBeenCalledTimes(1);
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

  it("should emit sync:initial:completed with success:false when pull fails", async () => {
    const { context, handlers } = createMockContext();
    const ds = createMockDirectorySync();
    const gs = createMockGitSync({
      pull: mock(async () => {
        throw new Error("Network timeout");
      }),
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
    if (handler) await handler();

    expect(context.messaging.send).toHaveBeenCalledWith(
      "sync:initial:completed",
      expect.objectContaining({ success: false, error: "Network timeout" }),
      { broadcast: true },
    );
  });

  it("should emit sync:initial:completed with success:false when sync fails", async () => {
    const { context, handlers } = createMockContext();
    const ds = createMockDirectorySync({
      sync: mock(async () => {
        throw new Error("DB locked");
      }),
    });

    setupInitialSync(
      context,
      () => ds,
      baseConfig,
      "directory-sync",
      createSilentLogger(),
    );

    const handler = handlers.get("system:plugins:ready");
    if (handler) await handler();

    expect(context.messaging.send).toHaveBeenCalledWith(
      "sync:initial:completed",
      expect.objectContaining({ success: false, error: "DB locked" }),
      { broadcast: true },
    );
  });
});
