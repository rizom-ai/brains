import { createMockServicePluginContext } from "@brains/plugins/test";
import { describe, it, expect, mock } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
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
  context: ReturnType<typeof createMockServicePluginContext>;
} {
  // The factory's messaging is real, so setupInitialSync subscribes to the
  // actual bus and the test publishes to drive it — no captured handlers.
  return { context: createMockServicePluginContext({ dataDir: "/tmp/test" }) };
}

const baseConfig: DirectorySyncConfig = {
  autoSync: true,
  watchInterval: 1000,
  includeMetadata: true,
  initialSync: true,
  syncBatchSize: 10,
  syncPriority: 3,
  seedContent: false,
  strictSeedEntityTypes: false,
  deleteOnFileRemoval: true,
  syncInterval: 2,
  commitDebounce: 5000,
  maxImportFileBytes: 5 * 1024 * 1024,
};

describe("setupInitialSync with git", () => {
  it("should call gitSync.pull() before sync()", async () => {
    const { context } = createMockContext();
    const callOrder: string[] = [];

    const ds = createMockDirectorySync({
      recordPendingPullDeletes: mock(async (paths: string[]) => {
        expect(paths).toEqual(["deleted.md"]);
        callOrder.push("record-deletes");
      }),
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
        return { files: ["deleted.md"], deletedFiles: ["deleted.md"] };
      }),
    });
    const reconciliation = {
      captureCurrent: mock(async () => {
        callOrder.push("checkpoint");
      }),
      saveCheckpoint: mock(async () => {}),
    };

    setupInitialSync(
      context,
      () => ds,
      baseConfig,
      createSilentLogger(),
      gs,
      reconciliation,
    );

    await context.messaging.send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
    });

    expect(callOrder).toEqual(["pull", "record-deletes", "sync", "checkpoint"]);
  });

  it("settles startup import status and confirms generated Git changes", async () => {
    const { context } = createMockContext();
    const callOrder: string[] = [];
    const importResult = emptyImportResult({ imported: 1 });
    const checkpoint = {
      remoteFingerprint: "a".repeat(64),
      branch: "main",
      lastReconciledGitHead: "b".repeat(40),
      lastObservedRemoteHead: "b".repeat(40),
    };
    const ds = createMockDirectorySync({
      sync: mock(async () => {
        callOrder.push("sync");
        return {
          export: emptyExportResult(),
          import: importResult,
          duration: 0,
        };
      }),
    });
    const gs = createMockGitSync({
      pull: mock(async () => {
        callOrder.push("pull");
        return { files: [] };
      }),
      commitAndPush: mock(async () => {
        callOrder.push("commit-and-push");
        return { pushed: true, checkpoint };
      }),
    });
    const reconciliation = {
      captureCurrent: mock(async () => {
        callOrder.push("capture-current");
      }),
      saveCheckpoint: mock(async () => {
        callOrder.push("save-checkpoint");
      }),
    };
    const operationStatus = {
      addImportResult: mock(async () => {
        callOrder.push("import-status");
      }),
    };

    setupInitialSync(
      context,
      () => ds,
      baseConfig,
      createSilentLogger(),
      gs,
      reconciliation,
      undefined,
      operationStatus,
    );

    await context.messaging.send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
    });

    expect(operationStatus.addImportResult).toHaveBeenCalledWith(importResult);
    expect(reconciliation.saveCheckpoint).toHaveBeenCalledWith(checkpoint);
    expect(reconciliation.captureCurrent).not.toHaveBeenCalled();
    expect(callOrder).toEqual([
      "pull",
      "sync",
      "import-status",
      "commit-and-push",
      "save-checkpoint",
    ]);
  });

  it("fails startup when generated Git changes have no confirmed checkpoint", async () => {
    const { context } = createMockContext();
    const gs = createMockGitSync({
      commitAndPush: mock(async () => ({ pushed: true, checkpoint: null })),
    });
    const reconciliation = {
      captureCurrent: mock(async () => {}),
      saveCheckpoint: mock(async () => {}),
    };

    setupInitialSync(
      context,
      () => createMockDirectorySync(),
      baseConfig,
      createSilentLogger(),
      gs,
      reconciliation,
    );

    await context.messaging.send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
    });

    expect(context.messaging.send).toHaveBeenCalledWith({
      type: SYSTEM_CHANNELS.initialSyncCompleted,
      payload: {
        success: false,
        error:
          "Initial directory sync push did not return a confirmed checkpoint",
      },
      broadcast: true,
    });
  });

  it("tracks Git output and records interrupted-pull recovery", async () => {
    const { context } = createMockContext();
    const onGitProgress = mock(() => {});
    const onGitRecoverySucceeded = mock(async () => {});
    const onGitRecoveryFailed = mock(async () => {});
    const gs = createMockGitSync({
      pull: mock(async (_signal?: AbortSignal, onProgress?: () => void) => {
        onProgress?.();
        return { files: [] };
      }),
    });

    setupInitialSync(
      context,
      () => createMockDirectorySync(),
      baseConfig,
      createSilentLogger(),
      gs,
      undefined,
      {
        onGitProgress,
        onGitRecoverySucceeded,
        onGitRecoveryFailed,
      },
    );

    await context.messaging.send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
    });

    expect(onGitProgress).toHaveBeenCalledTimes(2);
    expect(onGitRecoverySucceeded).toHaveBeenCalledTimes(1);
    expect(onGitRecoveryFailed).not.toHaveBeenCalled();
  });

  it("should call sync when gitSync is not provided", async () => {
    const { context } = createMockContext();
    const syncMock = mock(async () => ({
      export: emptyExportResult(),
      import: emptyImportResult(),
      duration: 0,
    }));
    const ds = createMockDirectorySync({ sync: syncMock });

    setupInitialSync(context, () => ds, baseConfig, createSilentLogger());

    await context.messaging.send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
    });

    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it("should emit sync:initial:completed after sync", async () => {
    const { context } = createMockContext();
    const ds = createMockDirectorySync();
    const gs = createMockGitSync();

    setupInitialSync(context, () => ds, baseConfig, createSilentLogger(), gs);

    await context.messaging.send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
    });

    expect(context.messaging.send).toHaveBeenCalledWith({
      type: SYSTEM_CHANNELS.initialSyncCompleted,
      payload: { success: true },
      broadcast: true,
    });
  });

  it("should emit sync:initial:completed with success:false when pull fails", async () => {
    const { context } = createMockContext();
    const ds = createMockDirectorySync();
    const gs = createMockGitSync({
      pull: mock(async () => {
        throw new Error("Network timeout");
      }),
    });

    setupInitialSync(context, () => ds, baseConfig, createSilentLogger(), gs);

    await context.messaging.send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
    });

    expect(ds.sync).not.toHaveBeenCalled();
    expect(context.messaging.send).toHaveBeenCalledWith({
      type: SYSTEM_CHANNELS.initialSyncCompleted,
      payload: expect.objectContaining({
        success: false,
        error: "Network timeout",
      }),
      broadcast: true,
    });
  });

  it("should emit sync:initial:completed with success:false when sync fails", async () => {
    const { context } = createMockContext();
    const ds = createMockDirectorySync({
      sync: mock(async () => {
        throw new Error("DB locked");
      }),
    });

    setupInitialSync(context, () => ds, baseConfig, createSilentLogger());

    await context.messaging.send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
    });

    expect(context.messaging.send).toHaveBeenCalledWith({
      type: SYSTEM_CHANNELS.initialSyncCompleted,
      payload: expect.objectContaining({ success: false, error: "DB locked" }),
      broadcast: true,
    });
  });
});
