import { createMockShell, type MockShell } from "@brains/plugins/test";
import { describe, it, expect, mock } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { initialSyncSubscription } from "../../src/lib/initial-sync";
import type { DirectorySyncHost } from "../../src/host";
import { hostFor, installSubscriptions } from "../helpers/install";
import { createSilentLogger } from "@brains/test-utils";
import type { DirectorySyncConfig } from "../../src/types";
import {
  createMockDirectorySync,
  createMockGitSync,
  emptyExportResult,
  emptyImportResult,
} from "../fixtures";

async function createMockContext(): Promise<{
  shell: MockShell;
  host: DirectorySyncHost;
  completed: unknown[];
}> {
  // The shell's bus is real: the declared subscription is bound to it, the
  // test publishes the startup signal, and reads what initial sync announced.
  const shell = createMockShell({ dataDir: "/tmp/test" });
  const completed: unknown[] = [];
  shell
    .getMessageBus()
    .subscribe(SYSTEM_CHANNELS.initialSyncCompleted, async (message) => {
      completed.push(message.payload);
      return { success: true };
    });
  return { shell, host: await hostFor(shell), completed };
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
    const { shell, host } = await createMockContext();
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

    await installSubscriptions(shell, [
      initialSyncSubscription(
        host,
        () => ds,
        baseConfig,
        createSilentLogger(),
        gs,
        reconciliation,
      ),
    ]);

    await shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "test",
    });

    expect(callOrder).toEqual(["pull", "record-deletes", "sync", "checkpoint"]);
  });

  it("settles startup import status and confirms generated Git changes", async () => {
    const { shell, host } = await createMockContext();
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

    await installSubscriptions(shell, [
      initialSyncSubscription(
        host,
        () => ds,
        baseConfig,
        createSilentLogger(),
        gs,
        reconciliation,
        undefined,
        operationStatus,
      ),
    ]);

    await shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "test",
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
    const { shell, host, completed } = await createMockContext();
    const gs = createMockGitSync({
      commitAndPush: mock(async () => ({ pushed: true, checkpoint: null })),
    });
    const reconciliation = {
      captureCurrent: mock(async () => {}),
      saveCheckpoint: mock(async () => {}),
    };

    await installSubscriptions(shell, [
      initialSyncSubscription(
        host,
        () => createMockDirectorySync(),
        baseConfig,
        createSilentLogger(),
        gs,
        reconciliation,
      ),
    ]);

    await shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "test",
    });

    expect(completed).toContainEqual({
      success: false,
      error:
        "Initial directory sync push did not return a confirmed checkpoint",
    });
  });

  it("tracks Git output and records interrupted-pull recovery", async () => {
    const { shell, host } = await createMockContext();
    const onGitProgress = mock(() => {});
    const onGitRecoverySucceeded = mock(async () => {});
    const onGitRecoveryFailed = mock(async () => {});
    const gs = createMockGitSync({
      pull: mock(async (_signal?: AbortSignal, onProgress?: () => void) => {
        onProgress?.();
        return { files: [] };
      }),
    });

    await installSubscriptions(shell, [
      initialSyncSubscription(
        host,
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
      ),
    ]);

    await shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "test",
    });

    expect(onGitProgress).toHaveBeenCalledTimes(2);
    expect(onGitRecoverySucceeded).toHaveBeenCalledTimes(1);
    expect(onGitRecoveryFailed).not.toHaveBeenCalled();
  });

  it("should call sync when gitSync is not provided", async () => {
    const { shell, host } = await createMockContext();
    const syncMock = mock(async () => ({
      export: emptyExportResult(),
      import: emptyImportResult(),
      duration: 0,
    }));
    const ds = createMockDirectorySync({ sync: syncMock });

    await installSubscriptions(shell, [
      initialSyncSubscription(host, () => ds, baseConfig, createSilentLogger()),
    ]);

    await shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "test",
    });

    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it("should emit sync:initial:completed after sync", async () => {
    const { shell, host, completed } = await createMockContext();
    const ds = createMockDirectorySync();
    const gs = createMockGitSync();

    await installSubscriptions(shell, [
      initialSyncSubscription(
        host,
        () => ds,
        baseConfig,
        createSilentLogger(),
        gs,
      ),
    ]);

    await shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "test",
    });

    expect(completed).toContainEqual({ success: true });
  });

  it("should emit sync:initial:completed with success:false when pull fails", async () => {
    const { shell, host, completed } = await createMockContext();
    const ds = createMockDirectorySync();
    const gs = createMockGitSync({
      pull: mock(async () => {
        throw new Error("Network timeout");
      }),
    });

    await installSubscriptions(shell, [
      initialSyncSubscription(
        host,
        () => ds,
        baseConfig,
        createSilentLogger(),
        gs,
      ),
    ]);

    await shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "test",
    });

    expect(ds.sync).not.toHaveBeenCalled();
    expect(completed).toContainEqual(
      expect.objectContaining({
        success: false,
        error: "Network timeout",
      }),
    );
  });

  it("should emit sync:initial:completed with success:false when sync fails", async () => {
    const { shell, host, completed } = await createMockContext();
    const ds = createMockDirectorySync({
      sync: mock(async () => {
        throw new Error("DB locked");
      }),
    });

    await installSubscriptions(shell, [
      initialSyncSubscription(host, () => ds, baseConfig, createSilentLogger()),
    ]);

    await shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "test",
    });

    expect(completed).toContainEqual(
      expect.objectContaining({ success: false, error: "DB locked" }),
    );
  });
});
