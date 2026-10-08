import { createPluginHarness } from "@brains/plugins/test";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  defineServicePlugin,
  SYSTEM_CHANNELS,
  type ServiceBatchStatus,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { describe, it, expect, mock } from "bun:test";
import { JOB_CHANNELS } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import {
  initialSyncSubscriptions,
  type InitialSyncOptions,
} from "../../src/lib/initial-sync";
import type { DirectorySyncOperationSnapshot } from "../../src/lib/directory-sync-operation-status";
import type { BatchResult, DirectorySyncConfig } from "../../src/types";
import type { GitReconciliationResult } from "../../src/lib/git-reconciliation";
import { hostFor, PACKAGE_METADATA } from "../helpers/install";
import { createMockDirectorySync, createMockGitSync } from "../fixtures";

const config: DirectorySyncConfig = {
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
const batch = (batchId: string): BatchResult => ({
  batchId,
  operationCount: 2,
  exportOperationsCount: 0,
  importOperationsCount: 2,
  totalFiles: 100,
});
const status = (
  id: string,
  outcome: ServiceBatchStatus["status"] = "processing",
  errors: ServiceBatchStatus["errors"] = [],
): ServiceBatchStatus => ({
  id,
  status: outcome,
  total: 1,
  completed: outcome === "completed" ? 1 : 0,
  failed: outcome === "failed" ? 1 : 0,
  errors,
});
const reconciliation = (
  result: BatchResult | null,
): NonNullable<InitialSyncOptions["reconciliation"]> => ({
  pullAndQueue: mock(async (): Promise<GitReconciliationResult> => ({
    mode: "full",
    files: [],
    deletedFiles: [],
    batch: result,
    checkpointAdvanced: result !== null,
  })),
});
function operationStatus(
  activeBatchId?: string,
): NonNullable<InitialSyncOptions["operationStatus"]> {
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
interface InitialSyncFixture {
  context: InitialSyncOptions["context"];
  ds: ReturnType<typeof createMockDirectorySync>;
  statuses: Map<string, ServiceBatchStatus | null>;
  batchStatus: ReturnType<
    typeof mock<(id: string) => Promise<ServiceBatchStatus | null>>
  >;
  completed: unknown[];
  dispose(): Promise<void>;
  register(): Promise<unknown[]>;
  progress(id: string, claimedStatus?: string): Promise<unknown>;
  settle(
    id: string,
    outcome?: "completed" | "failed",
    errors?: ServiceBatchStatus["errors"],
  ): Promise<void>;
}
async function fixture(
  options: Partial<Omit<InitialSyncOptions, "context">> = {},
): Promise<InitialSyncFixture> {
  const harness = createPluginHarness({ dataDir: "/tmp/test" });
  const shell = harness.getMockShell();
  const host = await hostFor(shell);
  const statuses = new Map<string, ServiceBatchStatus | null>();
  const batchStatus = mock(async (id: string) =>
    statuses.has(id) ? (statuses.get(id) ?? null) : status(id),
  );
  const context = { ...host, jobs: { ...host.jobs, batchStatus } };
  const completed: unknown[] = [];
  shell
    .getMessageBus()
    .subscribe(SYSTEM_CHANNELS.initialSyncCompleted, async (message) => {
      completed.push(message.payload);
      return { success: true };
    });
  const ds = createMockDirectorySync();
  const subscriptions = initialSyncSubscriptions({
    context,
    config,
    getDirectorySync: () => ds,
    logger: createSilentLogger(),
    gitSync: createMockGitSync(),
    reconciliation: reconciliation(batch("initial-batch")),
    ...options,
  });
  const definition = defineServicePlugin(
    { id: "directory-sync", config: z.object({}) },
    { subscriptions: () => subscriptions },
  );
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    PACKAGE_METADATA,
  );
  if (!plugin) throw new Error("Missing subscription fixture");
  await harness.installPlugin(plugin);
  const register = async (): Promise<unknown[]> =>
    shell.getMessageBus().collect({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "shell",
    });
  const progress = async (
    id: string,
    claimedStatus = "completed",
  ): Promise<unknown> =>
    shell.getMessageBus().send({
      type: JOB_CHANNELS.progress,
      payload: { id, type: "batch", status: claimedStatus },
      sender: "queue",
      broadcast: true,
    });
  const settle = async (
    id: string,
    outcome: "completed" | "failed" = "completed",
    errors: ServiceBatchStatus["errors"] = [],
  ): Promise<void> => {
    statuses.set(id, status(id, outcome, errors));
    await progress(id, outcome);
  };
  return {
    context,
    ds,
    statuses,
    batchStatus,
    completed,
    dispose: (): Promise<void> => harness.reset(),
    register,
    progress,
    settle,
  };
}

describe("declared initial sync", () => {
  it("queues a full pulled repair sweep rather than importing on boot", async () => {
    const reconciler = reconciliation(batch("initial-batch"));
    const f = await fixture({ reconciliation: reconciler });
    expect(await f.register()).toEqual([
      { success: true, data: { initialSyncPending: true } },
    ]);
    expect(reconciler.pullAndQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        context: f.context,
        source: "initial-sync",
        full: true,
      }),
    );
    expect(f.ds.sync).not.toHaveBeenCalled();
    expect(f.completed).toEqual([]);
    await f.register();
    expect(reconciler.pullAndQueue).toHaveBeenCalledTimes(1);
  });
  it("ignores unrelated and forged terminal progress, then completes exactly once", async () => {
    const f = await fixture();
    await f.register();
    await f.settle("another-batch");
    await f.progress("initial-batch");
    expect(f.completed).toEqual([]);
    await f.settle("initial-batch");
    await f.progress("initial-batch");
    expect(f.completed).toEqual([{ success: true }]);
  });
  it("reports durable batch errors rather than trusting a progress payload", async () => {
    const f = await fixture();
    await f.register();
    await f.settle("initial-batch", "failed", [
      { code: "handler_failed", message: "DB locked" },
    ]);
    expect(f.completed).toEqual([{ success: false, error: "DB locked" }]);
  });
  it("reads batches that completed before they were followed", async () => {
    const f = await fixture();
    f.statuses.set("initial-batch", status("initial-batch", "completed"));
    expect(await f.register()).toEqual([
      { success: true, data: { initialSyncPending: false } },
    ]);
    expect(f.completed).toEqual([{ success: true }]);
  });
  it("requires the failed outcome even when a batch failed before it was followed", async () => {
    const f = await fixture();
    f.statuses.set("initial-batch", status("initial-batch", "failed"));
    expect(await f.register()).toEqual([
      { success: true, data: { initialSyncPending: true } },
    ]);
    expect(await f.register()).toEqual([
      { success: true, data: { initialSyncPending: true } },
    ]);
    expect(f.completed).toEqual([
      { success: false, error: "Initial sync batch initial-batch failed" },
    ]);
  });
  it("completes immediately with no import work", async () => {
    const f = await fixture({ reconciliation: reconciliation(null) });
    expect(await f.register()).toEqual([
      { success: true, data: { initialSyncPending: false } },
    ]);
    expect(f.completed).toEqual([{ success: true }]);
  });
  it("waits for both an earlier unfinished batch and the current batch", async () => {
    const f = await fixture({
      operationStatus: operationStatus("earlier-batch"),
    });
    await f.register();
    await f.settle("initial-batch");
    expect(f.completed).toEqual([]);
    await f.settle("earlier-batch");
    expect(f.completed).toEqual([{ success: true }]);
  });
  it("follows an earlier batch even when this boot queues none", async () => {
    const f = await fixture({
      operationStatus: operationStatus("earlier-batch"),
      reconciliation: reconciliation(null),
    });
    expect(await f.register()).toEqual([
      { success: true, data: { initialSyncPending: true } },
    ]);
    await f.settle("earlier-batch");
    expect(f.completed).toEqual([{ success: true }]);
  });
  it("records and attaches the startup run", async () => {
    const operations = operationStatus();
    const f = await fixture({ operationStatus: operations });
    await f.register();
    expect(operations.startRun).toHaveBeenCalledWith("startup", "pulling");
    expect(operations.attachBatch).toHaveBeenCalledWith(
      "startup-run",
      "initial-batch",
    );
  });
  it("queues directory work without Git", async () => {
    const ds = createMockDirectorySync({
      queueSyncBatch: mock(async () => batch("initial-batch")),
    });
    const f = await fixture({
      gitSync: undefined,
      reconciliation: undefined,
      getDirectorySync: () => ds,
    });
    await f.register();
    expect(ds.queueSyncBatch).toHaveBeenCalledWith(f.context, "initial-sync");
    expect(ds.sync).not.toHaveBeenCalled();
  });
  it("tracks Git progress and interrupted-pull recovery", async () => {
    const recovery = {
      onGitProgress: mock(() => {}),
      onGitRecoverySucceeded: mock(async () => {}),
      onGitRecoveryFailed: mock(async () => {}),
    };
    const reconciler = reconciliation(batch("initial-batch"));
    const f = await fixture({ recovery, reconciliation: reconciler });
    await f.register();
    expect(reconciler.pullAndQueue).toHaveBeenCalledWith(
      expect.objectContaining({ onGitProgress: recovery.onGitProgress }),
    );
    expect(recovery.onGitRecoverySucceeded).toHaveBeenCalledTimes(1);
    expect(recovery.onGitRecoveryFailed).not.toHaveBeenCalled();
  });
  it("reports queueing failures and fails the tracked run", async () => {
    const operations = operationStatus();
    const f = await fixture({
      operationStatus: operations,
      reconciliation: {
        pullAndQueue: mock(async () => {
          throw new Error("Network timeout");
        }),
      },
    });
    expect(await f.register()).toEqual([
      { success: true, data: { initialSyncPending: true } },
    ]);
    expect(await f.register()).toEqual([
      { success: true, data: { initialSyncPending: true } },
    ]);
    expect(operations.failRun).toHaveBeenCalledWith(
      "startup-run",
      "Network timeout",
      "git",
    );
    expect(f.completed).toEqual([{ success: false, error: "Network timeout" }]);
  });
  it("fails visibly for a missing followed batch", async () => {
    const f = await fixture();
    f.statuses.set("initial-batch", null);
    expect(await f.register()).toEqual([
      { success: true, data: { initialSyncPending: true } },
    ]);
    expect(f.completed).toEqual([
      {
        success: false,
        error: "Initial sync batch initial-batch was not found",
      },
    ]);
  });
  it("does not mistake a transient status-read failure for completion", async () => {
    const f = await fixture();
    f.batchStatus.mockImplementationOnce(async () => {
      throw new Error("Temporary read failure");
    });
    expect(await f.register()).toEqual([
      { success: true, data: { initialSyncPending: true } },
    ]);
    expect(f.completed).toEqual([]);
    await f.settle("initial-batch");
    expect(f.completed).toEqual([{ success: true }]);
  });
  it("unsubscribes on shutdown rather than reporting a late completion", async () => {
    const f = await fixture();
    await f.register();
    await f.dispose();
    await f.settle("initial-batch");
    expect(f.completed).toEqual([]);
  });
});
