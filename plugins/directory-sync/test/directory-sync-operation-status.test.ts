import { describe, expect, it, mock } from "bun:test";
import type {
  BatchJobStatus,
  JobInfo,
  ServicePluginContext,
} from "@brains/plugins";
import {
  createMockServicePluginContext,
  createMockShell,
} from "@brains/test-utils";
import { DirectorySyncOperationStatusService } from "../src/lib/directory-sync-operation-status";

function createContext(): ServicePluginContext {
  return {
    ...createMockServicePluginContext(),
    runtimeState: createMockShell().getRuntimeState(),
  } as ServicePluginContext;
}

function createService(
  context: ServicePluginContext,
): DirectorySyncOperationStatusService {
  return new DirectorySyncOperationStatusService(
    context.runtimeState,
    context.jobs,
    context.logger,
    "/srv/brain-data",
  );
}

describe("DirectorySyncOperationStatusService", () => {
  it("records bounded, relative quarantine attention and run metrics", async () => {
    const context = createContext();
    const service = createService(context);
    await service.initialize();
    const runId = await service.startRun("manual", "importing");
    if (!runId) throw new Error("Expected a tracked run");

    await service.addImportResult({
      imported: 2,
      skipped: 1,
      failed: 0,
      quarantined: 1,
      quarantinedFiles: ["/srv/brain-data/post/broken.md.invalid"],
      errors: [],
      jobIds: [],
    });
    await service.completeRun(runId, "Import complete");

    const snapshot = await service.getSnapshot();
    expect(snapshot.activeRun).toBeUndefined();
    expect(snapshot.recentRuns[0]).toMatchObject({
      source: "manual",
      outcome: "attention",
      imported: 2,
      skipped: 1,
      quarantined: 1,
    });
    expect(snapshot.issues[0]).toMatchObject({
      kind: "quarantined",
      path: "post/broken.md.invalid",
    });
    expect(JSON.stringify(snapshot)).not.toContain("/srv/brain-data");
  });

  it("reconciles a completed Git request through its terminal import batch", async () => {
    const base = createContext();
    const getStatus = mock(async (): Promise<JobInfo> => ({
      id: "job-1",
      type: "sync-request",
      data: "{}",
      status: "completed" as const,
      source: null,
      priority: 3,
      retryCount: 0,
      maxRetries: 0,
      lastError: null,
      createdAt: Date.now(),
      scheduledFor: Date.now(),
      startedAt: Date.now(),
      completedAt: Date.now(),
      metadata: {
        rootJobId: "job-1",
        operationType: "file_operations",
      },
      result: JSON.stringify({
        gitPulled: true,
        batchQueued: true,
        batchId: "batch-1",
        importOperations: 2,
        totalFiles: 5,
      }),
    }));
    const getBatchStatus = mock(async (): Promise<BatchJobStatus> => ({
      batchId: "batch-1",
      totalOperations: 2,
      completedOperations: 2,
      failedOperations: 0,
      errors: [],
      status: "completed" as const,
    }));
    const context = {
      ...base,
      jobs: { ...base.jobs, getStatus, getBatchStatus },
    } as ServicePluginContext;
    const service = createService(context);
    await service.initialize();
    const runId = await service.startRun("manual", "pulling");
    if (!runId) throw new Error("Expected a tracked run");
    await service.attachJob(runId, "job-1");

    const snapshot = await service.getSnapshot();
    expect(getStatus).toHaveBeenCalledWith("job-1");
    expect(getBatchStatus).toHaveBeenCalledWith("batch-1");
    expect(snapshot.activeRun).toBeUndefined();
    expect(snapshot.recentRuns[0]).toMatchObject({
      id: runId,
      outcome: "succeeded",
      summary: "2 sync operations completed",
    });
  });

  it("does not let watcher activity replace an active manual run", async () => {
    const context = createContext();
    const service = createService(context);
    await service.initialize();
    const manualRunId = await service.startRun("manual", "pulling");

    expect(await service.startRun("watcher", "importing")).toBeUndefined();
    expect((await service.getSnapshot()).activeRun).toMatchObject({
      id: manualRunId,
      source: "manual",
      state: "pulling",
    });
  });

  it("redacts credential-bearing errors and caps terminal history", async () => {
    const context = createContext();
    const service = createService(context);
    await service.initialize();

    for (let index = 0; index < 6; index++) {
      await service.recordTerminal(
        "save",
        "succeeded",
        `Commit ${index} complete`,
      );
    }
    await service.recordIssue({
      kind: "git",
      message:
        "Failed https://operator:supersecret@example.com/org/repo.git?token=abc123",
    });

    const snapshot = await service.getSnapshot();
    expect(snapshot.recentRuns).toHaveLength(5);
    expect(JSON.stringify(snapshot)).not.toContain("supersecret");
    expect(JSON.stringify(snapshot)).not.toContain("abc123");
    expect(snapshot.issues[0]?.message).toContain("[redacted]");
  });
});
