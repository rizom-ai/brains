import { createMockServicePluginContext } from "@brains/plugins/test";
import { describe, it, expect, mock } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { JOB_CHANNELS } from "@brains/contracts";
import { setupInitialSync } from "../../src/lib/initial-sync";
import type { DirectorySyncOperationSnapshot } from "../../src/lib/directory-sync-operation-status";
import { createSilentLogger } from "@brains/test-utils";
import type { BatchResult, DirectorySyncConfig } from "../../src/types";
import type { GitReconciliationResult } from "../../src/lib/git-reconciliation";
import { createMockDirectorySync, createMockGitSync } from "../fixtures";

type MockContext = ReturnType<typeof createMockServicePluginContext>;

/** initialSyncCompleted payloads each context's bus has carried. */
const completionLog = new WeakMap<MockContext, unknown[]>();

function completions(context: MockContext): unknown[] {
  return completionLog.get(context) ?? [];
}

/**
 * The factory's messaging is real, so setupInitialSync subscribes to the
 * actual bus and the test publishes to drive it. Batches report as still
 * processing until a test publishes their completion.
 */
function createMockContext(): MockContext {
  const context = createMockServicePluginContext({ dataDir: "/tmp/test" });
  context.jobs.getBatchStatus.mockImplementation(async (batchId: string) => ({
    batchId,
    totalOperations: 1,
    completedOperations: 0,
    failedOperations: 0,
    errors: [],
    status: "processing" as const,
  }));
  const completed: unknown[] = [];
  completionLog.set(context, completed);
  context.messaging.subscribe(
    SYSTEM_CHANNELS.initialSyncCompleted,
    (message) => {
      completed.push(message.payload);
      return { success: true };
    },
  );
  return context;
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

function batchResult(batchId: string): BatchResult {
  return {
    batchId,
    operationCount: 2,
    exportOperationsCount: 0,
    importOperationsCount: 2,
    totalFiles: 100,
  };
}

function reconciled(batch: BatchResult | null): GitReconciliationResult {
  return {
    mode: "full",
    files: [],
    deletedFiles: [],
    batch,
    checkpointAdvanced: batch !== null,
  };
}

function createReconciliation(batch: BatchResult | null): {
  pullAndQueue: ReturnType<typeof mock>;
} {
  return { pullAndQueue: mock(async () => reconciled(batch)) };
}

function createOperationStatus(activeBatchId?: string): {
  startRun: ReturnType<typeof mock>;
  attachBatch: ReturnType<typeof mock>;
  completeRun: ReturnType<typeof mock>;
  failRun: ReturnType<typeof mock>;
  getSnapshot: ReturnType<typeof mock>;
} {
  const startedAt = new Date(0).toISOString();
  const snapshot: DirectorySyncOperationSnapshot = {
    ...(activeBatchId
      ? {
          activeRun: {
            id: "earlier-run",
            source: "startup",
            state: "importing",
            startedAt,
            lastProgressAt: startedAt,
            batchId: activeBatchId,
            imported: 0,
            skipped: 0,
            failed: 0,
            quarantined: 0,
            exported: 0,
          },
        }
      : {}),
    recentRuns: [],
    issues: [],
  };
  return {
    startRun: mock(async () => (activeBatchId ? undefined : "startup-run")),
    attachBatch: mock(async () => {}),
    completeRun: mock(async () => {}),
    failRun: mock(async () => {}),
    getSnapshot: mock(async () => snapshot),
  };
}

/** The shell collects every subscriber's answer; this test has the one. */
async function registerPlugins(context: MockContext): Promise<unknown[]> {
  const response = await context.messaging.send({
    type: SYSTEM_CHANNELS.pluginsRegistered,
    payload: {},
  });
  return ["data" in response ? response.data : undefined];
}

async function settleBatch(
  context: MockContext,
  batchId: string,
  status: "completed" | "failed",
  errors: string[] = [],
): Promise<void> {
  await context.messaging.send({
    type: JOB_CHANNELS.progress,
    payload: {
      id: batchId,
      type: "batch",
      status,
      metadata: { operationType: "file_operations", rootJobId: batchId },
      batchDetails: {
        totalOperations: 1,
        completedOperations: status === "completed" ? 1 : 0,
        failedOperations: status === "failed" ? 1 : 0,
        errors,
      },
    },
    broadcast: true,
  });
}

describe("setupInitialSync", () => {
  it("queues the pulled content as an import batch instead of importing it", async () => {
    const context = createMockContext();
    const ds = createMockDirectorySync();
    const reconciliation = createReconciliation(batchResult("initial-batch"));

    setupInitialSync({
      context,
      getDirectorySync: () => ds,
      config: baseConfig,
      logger: createSilentLogger(),
      gitSync: createMockGitSync(),
      reconciliation,
    });

    expect(await registerPlugins(context)).toEqual([
      { initialSyncPending: true },
    ]);
    expect(reconciliation.pullAndQueue).toHaveBeenCalledWith(
      expect.objectContaining({ context, source: "initial-sync", full: true }),
    );
    expect(ds.sync).not.toHaveBeenCalled();
    expect(completions(context)).toEqual([]);
  });

  it("sends initialSyncCompleted when its batch completes", async () => {
    const context = createMockContext();

    setupInitialSync({
      context,
      getDirectorySync: () => createMockDirectorySync(),
      config: baseConfig,
      logger: createSilentLogger(),
      gitSync: createMockGitSync(),
      reconciliation: createReconciliation(batchResult("initial-batch")),
    });
    await registerPlugins(context);
    await settleBatch(context, "another-batch", "completed");
    expect(completions(context)).toEqual([]);

    await settleBatch(context, "initial-batch", "completed");

    expect(completions(context)).toEqual([{ success: true }]);
  });

  it("reports the batch's errors when its batch fails", async () => {
    const context = createMockContext();

    setupInitialSync({
      context,
      getDirectorySync: () => createMockDirectorySync(),
      config: baseConfig,
      logger: createSilentLogger(),
      gitSync: createMockGitSync(),
      reconciliation: createReconciliation(batchResult("initial-batch")),
    });
    await registerPlugins(context);
    await settleBatch(context, "initial-batch", "failed", ["DB locked"]);

    expect(completions(context)).toEqual([
      { success: false, error: "DB locked" },
    ]);
  });

  it("completes when its batch settled before it was followed", async () => {
    const context = createMockContext();
    context.jobs.getBatchStatus.mockImplementation(async (batchId: string) => ({
      batchId,
      totalOperations: 1,
      completedOperations: 1,
      failedOperations: 0,
      errors: [],
      status: "completed" as const,
    }));

    setupInitialSync({
      context,
      getDirectorySync: () => createMockDirectorySync(),
      config: baseConfig,
      logger: createSilentLogger(),
      gitSync: createMockGitSync(),
      reconciliation: createReconciliation(batchResult("initial-batch")),
    });
    await registerPlugins(context);
    await Bun.sleep(0);

    expect(completions(context)).toEqual([{ success: true }]);
  });

  it("completes at once when nothing needs importing", async () => {
    const context = createMockContext();

    setupInitialSync({
      context,
      getDirectorySync: () => createMockDirectorySync(),
      config: baseConfig,
      logger: createSilentLogger(),
      gitSync: createMockGitSync(),
      reconciliation: createReconciliation(null),
    });

    expect(await registerPlugins(context)).toEqual([
      { initialSyncPending: false },
    ]);
    expect(completions(context)).toEqual([{ success: true }]);
  });

  it("follows the batch an earlier boot left unfinished", async () => {
    const context = createMockContext();
    const operationStatus = createOperationStatus("earlier-batch");

    setupInitialSync({
      context,
      getDirectorySync: () => createMockDirectorySync(),
      config: baseConfig,
      logger: createSilentLogger(),
      gitSync: createMockGitSync(),
      reconciliation: createReconciliation(null),
      operationStatus,
    });

    expect(await registerPlugins(context)).toEqual([
      { initialSyncPending: true },
    ]);
    expect(completions(context)).toEqual([]);

    await settleBatch(context, "earlier-batch", "completed");

    expect(completions(context)).toEqual([{ success: true }]);
  });

  it("records the startup run and attaches its batch", async () => {
    const context = createMockContext();
    const operationStatus = createOperationStatus();

    setupInitialSync({
      context,
      getDirectorySync: () => createMockDirectorySync(),
      config: baseConfig,
      logger: createSilentLogger(),
      gitSync: createMockGitSync(),
      reconciliation: createReconciliation(batchResult("initial-batch")),
      operationStatus,
    });
    await registerPlugins(context);

    expect(operationStatus.startRun).toHaveBeenCalledWith("startup", "pulling");
    expect(operationStatus.attachBatch).toHaveBeenCalledWith(
      "startup-run",
      "initial-batch",
    );
  });

  it("queues the sync directory when Git is not configured", async () => {
    const context = createMockContext();
    const ds = createMockDirectorySync({
      queueSyncBatch: mock(async () => batchResult("initial-batch")),
    });

    setupInitialSync({
      context,
      getDirectorySync: () => ds,
      config: baseConfig,
      logger: createSilentLogger(),
    });

    expect(await registerPlugins(context)).toEqual([
      { initialSyncPending: true },
    ]);
    expect(ds.queueSyncBatch).toHaveBeenCalledWith(context, "initial-sync");
    expect(ds.sync).not.toHaveBeenCalled();
  });

  it("tracks Git output and records interrupted-pull recovery", async () => {
    const context = createMockContext();
    const onGitProgress = mock(() => {});
    const onGitRecoverySucceeded = mock(async () => {});
    const onGitRecoveryFailed = mock(async () => {});
    const reconciliation = createReconciliation(batchResult("initial-batch"));

    setupInitialSync({
      context,
      getDirectorySync: () => createMockDirectorySync(),
      config: baseConfig,
      logger: createSilentLogger(),
      gitSync: createMockGitSync(),
      reconciliation,
      recovery: {
        onGitProgress,
        onGitRecoverySucceeded,
        onGitRecoveryFailed,
      },
    });
    await registerPlugins(context);

    expect(reconciliation.pullAndQueue).toHaveBeenCalledWith(
      expect.objectContaining({ onGitProgress }),
    );
    expect(onGitRecoverySucceeded).toHaveBeenCalledTimes(1);
    expect(onGitRecoveryFailed).not.toHaveBeenCalled();
  });

  it("keeps defaults waiting and completes with success:false when the pull fails", async () => {
    const context = createMockContext();
    const onGitRecoveryFailed = mock(async () => {});

    setupInitialSync({
      context,
      getDirectorySync: () => createMockDirectorySync(),
      config: baseConfig,
      logger: createSilentLogger(),
      gitSync: createMockGitSync(),
      reconciliation: {
        pullAndQueue: mock(async () => {
          throw new Error("Network timeout");
        }),
      },
      recovery: {
        onGitProgress: mock(() => {}),
        onGitRecoverySucceeded: mock(async () => {}),
        onGitRecoveryFailed,
      },
    });

    expect(await registerPlugins(context)).toEqual([
      { initialSyncPending: true },
    ]);
    expect(onGitRecoveryFailed).toHaveBeenCalledTimes(1);
    expect(completions(context)).toEqual([
      { success: false, error: "Network timeout" },
    ]);
  });
});
