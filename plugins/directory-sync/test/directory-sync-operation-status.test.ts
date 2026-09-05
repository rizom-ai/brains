import {
  createMockServicePluginContext,
  createMockShell,
} from "@brains/plugins/test";
import { describe, expect, it, mock } from "bun:test";
import type {
  BatchJobStatus,
  JobInfo,
  ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { DirectorySyncOperationStatusService } from "../src/lib/directory-sync-operation-status";

function createContext(): ServicePluginContext {
  return {
    ...createMockServicePluginContext(),
    runtimeState: createMockShell().getRuntimeState(),
  };
}

function createService(
  context: ServicePluginContext,
  options?: {
    now?: () => number;
    inactivityTimeoutMs?: number;
    staleGraceMs?: number;
    progressPersistenceIntervalMs?: number;
  },
): DirectorySyncOperationStatusService {
  return new DirectorySyncOperationStatusService(
    context.runtimeState,
    context.jobs,
    context.logger,
    "/srv/brain-data",
    options,
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

  it("records skipped import issues without counting them as failures", async () => {
    const context = createContext();
    const service = createService(context);
    await service.initialize();

    await service.addImportResult({
      imported: 0,
      skipped: 1,
      failed: 0,
      quarantined: 0,
      quarantinedFiles: [],
      errors: [],
      issues: [
        {
          path: "/srv/brain-data/note/oversized.md",
          message: "File is 9 bytes; import limit is 8 bytes",
        },
      ],
      jobIds: [],
    });

    const snapshot = await service.getSnapshot();
    expect(snapshot.issues[0]).toMatchObject({
      kind: "import",
      path: "note/oversized.md",
      message: "File is 9 bytes; import limit is 8 bytes",
    });
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
      attemptId: "attempt-1",
      workerSlotId: "worker-a",
      workerSessionId: "session-a",
      leaseExpiresAt: Date.now(),
      attemptHeartbeatAt: Date.now(),
      runtimeUpdatedAt: Date.now(),
      progress: null,
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
    };
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

  it("migrates an active run from before durable progress tracking", async () => {
    const context = createContext();
    const legacyStore = context.runtimeState.scoped<unknown>({
      namespace: "directory-sync.operation-status",
      schema: z.unknown(),
    });
    await legacyStore.set("current", {
      activeRun: {
        id: "legacy-run",
        source: "periodic",
        state: "pulling",
        startedAt: "2025-01-01T00:00:00.000Z",
        imported: 0,
        skipped: 0,
        failed: 0,
        quarantined: 0,
        exported: 0,
      },
      recentRuns: [],
      issues: [],
    });

    const service = createService(context);
    expect(await service.initialize()).toMatchObject({
      id: "legacy-run",
      lastProgressAt: "2025-01-01T00:00:00.000Z",
    });
  });

  it("persists progress at phase boundaries and throttles output progress", async () => {
    const context = createContext();
    let now = 1_000;
    const service = createService(context, {
      now: () => now,
      progressPersistenceIntervalMs: 100,
    });
    await service.initialize();
    const runId = await service.startRun("manual", "pulling");
    if (!runId) throw new Error("Expected a tracked run");

    expect((await service.getSnapshot()).activeRun?.lastProgressAt).toBe(
      "1970-01-01T00:00:01.000Z",
    );

    now = 1_050;
    await service.markProgress(runId);
    expect((await service.getSnapshot()).activeRun?.lastProgressAt).toBe(
      "1970-01-01T00:00:01.000Z",
    );

    now = 1_100;
    await service.markProgress(runId);
    expect((await service.getSnapshot()).activeRun?.lastProgressAt).toBe(
      "1970-01-01T00:00:01.100Z",
    );

    now = 1_125;
    await service.markPhase(runId, "scanning");
    expect((await service.getSnapshot()).activeRun).toMatchObject({
      state: "scanning",
      lastProgressAt: "1970-01-01T00:00:01.125Z",
    });
  });

  it("classifies stale pulls from progress age without mutating run state", async () => {
    const context = createContext();
    let now = 10_000;
    const service = createService(context, {
      now: () => now,
      inactivityTimeoutMs: 1_000,
      staleGraceMs: 250,
    });
    await service.initialize();
    const runId = await service.startRun("periodic", "pulling");
    if (!runId) throw new Error("Expected a tracked run");

    now = 11_250;
    expect(await service.getOperationalHealth()).toEqual({
      status: "healthy",
      message: "No stale directory Git pull",
    });

    now = 11_251;
    expect(await service.getOperationalHealth()).toEqual({
      status: "degraded",
      message: "Directory Git pull has made no progress for 1251ms",
      details: {
        runId,
        source: "periodic",
        state: "pulling",
        lastProgressAt: "1970-01-01T00:00:10.000Z",
        inactivityMs: 1_251,
        staleAfterMs: 1_250,
      },
    });
    expect((await service.getSnapshot()).activeRun).toMatchObject({
      id: runId,
      state: "pulling",
      lastProgressAt: "1970-01-01T00:00:10.000Z",
    });
  });

  it("only applies stale-pull health to a processing Git job", async () => {
    const base = createContext();
    let jobStatus: JobInfo["status"] = "pending";
    const job: JobInfo = {
      id: "job-health",
      type: "sync-request",
      data: "{}",
      status: "pending",
      source: null,
      priority: 3,
      retryCount: 0,
      maxRetries: 0,
      lastError: null,
      createdAt: 1,
      scheduledFor: 1,
      startedAt: null,
      completedAt: null,
      attemptId: null,
      workerSlotId: null,
      workerSessionId: null,
      leaseExpiresAt: null,
      attemptHeartbeatAt: null,
      runtimeUpdatedAt: 1,
      progress: null,
      metadata: {
        rootJobId: "job-health",
        operationType: "file_operations",
      },
      result: null,
    };
    const context = {
      ...base,
      jobs: {
        ...base.jobs,
        getStatus: async (): Promise<JobInfo> => ({
          ...job,
          status: jobStatus,
        }),
      },
    };
    let now = 10_000;
    const service = createService(context, {
      now: () => now,
      inactivityTimeoutMs: 1_000,
      staleGraceMs: 250,
    });
    await service.initialize();
    const runId = await service.startRun("manual", "pulling");
    if (!runId) throw new Error("Expected a tracked run");
    await service.attachJob(runId, "job-health");
    now = 20_000;

    expect(await service.getOperationalHealth()).toMatchObject({
      status: "healthy",
    });
    jobStatus = "processing";
    expect(await service.getOperationalHealth()).toMatchObject({
      status: "degraded",
      details: { runId, inactivityMs: 10_000 },
    });
    jobStatus = "completed";
    expect(await service.getOperationalHealth()).toMatchObject({
      status: "healthy",
    });
  });

  it("preserves and records recovery of an unlinked pulling run after restart", async () => {
    const context = createContext();
    let now = 20_000;
    const first = createService(context, { now: () => now });
    await first.initialize();
    const runId = await first.startRun("manual", "pulling");
    if (!runId) throw new Error("Expected a tracked run");

    now = 25_000;
    const restarted = createService(context, { now: () => now });
    const interrupted = await restarted.initialize();

    expect(interrupted).toMatchObject({ id: runId, state: "pulling" });
    expect((await restarted.getSnapshot()).activeRun?.id).toBe(runId);

    await restarted.finishInterruptedPull(runId, {
      recovered: true,
      message:
        "Recovered https://operator:secret@example.com/org/content.git?token=hidden",
    });

    const snapshot = await restarted.getSnapshot();
    expect(snapshot.activeRun).toBeUndefined();
    expect(snapshot.recentRuns[0]).toMatchObject({
      id: runId,
      outcome: "attention",
      summary:
        "Recovered https://[redacted]@example.com/org/content.git?token=[redacted]",
    });
    expect(snapshot.issues[0]).toMatchObject({
      kind: "git",
      message:
        "Recovered https://[redacted]@example.com/org/content.git?token=[redacted]",
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
