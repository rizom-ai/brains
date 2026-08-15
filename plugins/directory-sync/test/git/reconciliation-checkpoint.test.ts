import { describe, expect, it, mock } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServicePluginContext } from "@brains/plugins";
import {
  createMockServicePluginContext,
  createMockShell,
} from "@brains/test-utils";
import { GitReconciliationService } from "../../src/lib/git-reconciliation";
import { createBrokerGitSync } from "./broker-git-sync";
import type {
  GitReconciliationCheckpoint,
  GitReconciliationDelta,
} from "../../src/types";
import { createMockDirectorySync, createMockGitSync } from "../fixtures";

const BASELINE: GitReconciliationCheckpoint = {
  remoteFingerprint: "a".repeat(64),
  branch: "main",
  lastReconciledGitHead: "1".repeat(40),
  lastObservedRemoteHead: "2".repeat(40),
};

const TARGET: GitReconciliationCheckpoint = {
  ...BASELINE,
  lastReconciledGitHead: "3".repeat(40),
  lastObservedRemoteHead: "4".repeat(40),
};

function createContext(): ServicePluginContext {
  return {
    ...createMockServicePluginContext(),
    runtimeState: createMockShell().getRuntimeState(),
  } as ServicePluginContext;
}

function incremental(
  overrides: Partial<
    Extract<GitReconciliationDelta, { mode: "incremental" }>
  > = {},
): GitReconciliationDelta {
  return {
    mode: "incremental",
    checkpoint: TARGET,
    files: ["note/changed.md", "note/deleted.md"],
    deletedFiles: ["note/deleted.md"],
    ...overrides,
  };
}

describe("GitReconciliationService", () => {
  it("queues nothing once its caller has aborted", async () => {
    // The lease used to carry the abort: `withLock(fn, signal)` refused a
    // cancelled turn. With sequencing inside operations, the check has to be
    // stated here, or a shutdown mid-replay still enqueues a batch.
    const context = createContext();
    const service = new GitReconciliationService(context.runtimeState);
    await service.saveCheckpoint(BASELINE);
    const queueSyncBatch = mock(async () => null);
    const getReconciliationDelta = mock(async () => incremental());

    const outcome = await service
      .replayAndQueue({
        gitSync: createMockGitSync({ getReconciliationDelta }),
        directorySync: createMockDirectorySync({ queueSyncBatch }),
        context,
        source: "startup-replay",
        signal: AbortSignal.abort(new Error("shutting down")),
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(outcome).toBeInstanceOf(Error);
    expect(getReconciliationDelta).not.toHaveBeenCalled();
    expect(queueSyncBatch).not.toHaveBeenCalled();
    expect(await service.getCheckpoint()).toEqual(BASELINE);
  });

  it("pulls, durably queues the checkpoint delta, then advances the checkpoint", async () => {
    const context = createContext();
    const service = new GitReconciliationService(context.runtimeState);
    await service.saveCheckpoint(BASELINE);
    const calls: string[] = [];
    const pull = mock(async () => {
      calls.push("pull");
      return { files: ["ignored-pull-result.md"] };
    });
    const getReconciliationDelta = mock(async (checkpoint) => {
      calls.push("derive");
      expect(checkpoint).toEqual(BASELINE);
      return incremental();
    });
    const recordPendingPullDeletes = mock(async () => {
      calls.push("pending-deletes");
    });
    const queueSyncBatch = mock(async () => {
      calls.push("queue");
      return {
        batchId: "batch-1",
        operationCount: 2,
        exportOperationsCount: 0,
        importOperationsCount: 1,
        totalFiles: 2,
      };
    });
    const suppressWatchPaths = mock(() => {
      calls.push("suppress");
    });

    const result = await service.pullAndQueue({
      gitSync: createMockGitSync({ pull, getReconciliationDelta }),
      directorySync: createMockDirectorySync({
        recordPendingPullDeletes,
        queueSyncBatch,
        suppressWatchPaths,
      }),
      context,
      source: "periodic-sync",
    });

    expect(calls).toEqual([
      "pull",
      "derive",
      "pending-deletes",
      "queue",
      "suppress",
    ]);
    expect(recordPendingPullDeletes).toHaveBeenCalledWith(["note/deleted.md"]);
    expect(queueSyncBatch).toHaveBeenCalledWith(
      context,
      "periodic-sync",
      undefined,
      ["note/changed.md", "note/deleted.md"],
      ["note/deleted.md"],
    );
    expect(result.batch?.batchId).toBe("batch-1");
    expect(await service.getCheckpoint()).toEqual(TARGET);
  });

  it("does not advance when changed work could not be queued", async () => {
    const context = createContext();
    const service = new GitReconciliationService(context.runtimeState);
    await service.saveCheckpoint(BASELINE);

    const result = await service.pullAndQueue({
      gitSync: createMockGitSync({
        getReconciliationDelta: mock(async () => incremental()),
      }),
      directorySync: createMockDirectorySync({
        queueSyncBatch: mock(async () => null),
      }),
      context,
      source: "periodic-sync",
    });

    expect(result.batch).toBeNull();
    expect(result.checkpointAdvanced).toBe(false);
    expect(await service.getCheckpoint()).toEqual(BASELINE);
  });

  it("uses a full-scan fallback and checkpoints only after its batch is durable", async () => {
    const context = createContext();
    const service = new GitReconciliationService(context.runtimeState);
    const delta: GitReconciliationDelta = {
      mode: "full",
      checkpoint: TARGET,
      reason: "repository-identity-mismatch",
    };
    const queueSyncBatch = mock(async () => ({
      batchId: "full-batch",
      operationCount: 2,
      exportOperationsCount: 0,
      importOperationsCount: 1,
      totalFiles: 1,
    }));

    const result = await service.replayAndQueue({
      gitSync: createMockGitSync({
        getReconciliationDelta: mock(async () => delta),
      }),
      directorySync: createMockDirectorySync({ queueSyncBatch }),
      context,
      source: "startup-replay",
    });

    expect(queueSyncBatch).toHaveBeenCalledWith(
      context,
      "startup-replay",
      undefined,
    );
    expect(result.mode).toBe("full");
    expect(await service.getCheckpoint()).toEqual(TARGET);
  });

  it("advances a no-change checkpoint without allocating a batch", async () => {
    const context = createContext();
    const service = new GitReconciliationService(context.runtimeState);
    await service.saveCheckpoint(BASELINE);
    const queueSyncBatch = mock(async () => {
      throw new Error("no batch expected");
    });

    const result = await service.pullAndQueue({
      gitSync: createMockGitSync({
        getReconciliationDelta: mock(async () =>
          incremental({ files: [], deletedFiles: [] }),
        ),
      }),
      directorySync: createMockDirectorySync({ queueSyncBatch }),
      context,
      source: "periodic-sync",
    });

    expect(queueSyncBatch).not.toHaveBeenCalled();
    expect(result.checkpointAdvanced).toBe(true);
    expect(await service.getCheckpoint()).toEqual(TARGET);
  });

  it("replays from the persisted checkpoint after service reconstruction", async () => {
    const runtimeState = createMockShell().getRuntimeState();
    const context = {
      ...createMockServicePluginContext(),
      runtimeState,
    } as ServicePluginContext;
    await new GitReconciliationService(runtimeState).saveCheckpoint(BASELINE);
    const queueSyncBatch = mock(async () => ({
      batchId: "replayed-batch",
      operationCount: 1,
      exportOperationsCount: 0,
      importOperationsCount: 1,
      totalFiles: 2,
    }));

    const restartedService = new GitReconciliationService(runtimeState);
    await restartedService.replayAndQueue({
      gitSync: createMockGitSync({
        getReconciliationDelta: mock(async (checkpoint) => {
          expect(checkpoint).toEqual(BASELINE);
          return incremental();
        }),
      }),
      directorySync: createMockDirectorySync({ queueSyncBatch }),
      context,
      source: "startup-replay",
    });

    expect(queueSyncBatch).toHaveBeenCalledTimes(1);
    expect(await restartedService.getCheckpoint()).toEqual(TARGET);
  });

  it("replays a remote merge that completed before its batch was queued", async () => {
    const root = mkdtempSync(join(tmpdir(), "git-reconciliation-restart-"));
    const remoteDir = join(root, "remote.git");
    const dataDir = join(root, "brain-data");
    const writerDir = join(root, "writer");
    mkdirSync(remoteDir);
    mkdirSync(dataDir);
    execSync("git init --bare --initial-branch=main", {
      cwd: remoteDir,
      stdio: "ignore",
    });
    const gitSync = await createBrokerGitSync({
      logger: createContext().logger,
      dataDir,
      gitUrl: remoteDir,
      authorName: "Test",
      authorEmail: "test@example.com",
    });

    try {
      await gitSync.initialize();
      writeFileSync(join(dataDir, "baseline.md"), "# Baseline");
      await gitSync.commit("baseline");
      await gitSync.push();

      const runtimeState = createMockShell().getRuntimeState();
      const context = {
        ...createMockServicePluginContext(),
        runtimeState,
      } as ServicePluginContext;
      const beforeCrash = new GitReconciliationService(runtimeState);
      await beforeCrash.captureCurrent(gitSync);

      execSync(`git clone ${remoteDir} ${writerDir}`, { stdio: "ignore" });
      writeFileSync(join(writerDir, "remote-after-checkpoint.md"), "# Remote");
      execSync("git add -A", { cwd: writerDir, stdio: "ignore" });
      execSync(
        'git -c user.name=Test -c user.email=test@example.com commit -m "remote after checkpoint"',
        { cwd: writerDir, stdio: "ignore" },
      );
      execSync("git push", { cwd: writerDir, stdio: "ignore" });

      // Simulate process loss after Git changed HEAD but before durable enqueue.
      await gitSync.pull();

      const queueSyncBatch = mock(async () => ({
        batchId: "recovered-batch",
        operationCount: 1,
        exportOperationsCount: 0,
        importOperationsCount: 1,
        totalFiles: 1,
      }));
      const restarted = new GitReconciliationService(runtimeState);
      const result = await restarted.replayAndQueue({
        gitSync,
        directorySync: createMockDirectorySync({ queueSyncBatch }),
        context,
        source: "startup-replay",
      });

      expect(result.mode).toBe("incremental");
      expect(result.files).toContain("remote-after-checkpoint.md");
      expect(queueSyncBatch).toHaveBeenCalledWith(
        context,
        "startup-replay",
        undefined,
        ["remote-after-checkpoint.md"],
        [],
      );
      const current = await gitSync.getReconciliationDelta(undefined);
      expect(await restarted.getCheckpoint()).toEqual(current.checkpoint);
    } finally {
      await gitSync.cleanup();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("captures current Git state only after a completed full initial sync", async () => {
    const context = createContext();
    const service = new GitReconciliationService(context.runtimeState);
    const getReconciliationDelta = mock(
      async (): Promise<GitReconciliationDelta> => ({
        mode: "full",
        checkpoint: TARGET,
        reason: "missing-checkpoint",
      }),
    );

    await service.captureCurrent(createMockGitSync({ getReconciliationDelta }));

    expect(getReconciliationDelta).toHaveBeenCalledWith(undefined);
    expect(await service.getCheckpoint()).toEqual(TARGET);
  });
});
