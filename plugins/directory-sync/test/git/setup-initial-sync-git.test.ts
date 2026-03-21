import { describe, it, expect, mock } from "bun:test";
import { setupInitialSync } from "../../src/lib/initial-sync";
import { createSilentLogger } from "@brains/test-utils";
import type { DirectorySync } from "../../src/lib/directory-sync";
import type { DirectorySyncConfig } from "../../src/types";
import type { GitSync } from "../../src/lib/git-sync";

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
      },
    } as unknown as Parameters<typeof setupInitialSync>[0],
    handlers,
  };
}

function createMockDirectorySync(): DirectorySync {
  return {
    sync: mock(async () => ({
      import: {
        imported: 0,
        skipped: 0,
        failed: 0,
        quarantined: 0,
        quarantinedFiles: [],
        errors: [],
        jobIds: [],
      },
      export: { exported: 0, failed: 0, errors: [] },
      duration: 0,
    })),
    initializeDirectory: mock(async () => {}),
  } as unknown as DirectorySync;
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
};

describe("setupInitialSync with git", () => {
  it("should call gitSync.pull() before directorySync.sync()", async () => {
    const { context, handlers } = createMockContext();
    const ds = createMockDirectorySync();
    const gs = createMockGitSync();
    const callOrder: string[] = [];

    gs.pull = mock(async () => {
      callOrder.push("pull");
      return { files: [] };
    });
    (ds.sync as ReturnType<typeof mock>) = mock(async () => {
      callOrder.push("sync");
      return {
        import: {
          imported: 0,
          skipped: 0,
          failed: 0,
          quarantined: 0,
          quarantinedFiles: [],
          errors: [],
          jobIds: [],
        },
        export: { exported: 0, failed: 0, errors: [] },
        duration: 0,
      };
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

  it("should not call gitSync.pull() when gitSync is not provided", async () => {
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

    expect(ds.sync).toHaveBeenCalledTimes(1);
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
