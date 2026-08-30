import { describe, expect, it, mock } from "bun:test";
import type { JobInfo } from "@brains/plugins";
import { createServicePluginContext } from "@brains/plugins/test";
import { createMockShell } from "@brains/test-utils";
import { SiteBuildStatusService } from "../../src/lib/site-build-status";

function createStatusService(
  getStatus?: (jobId: string) => Promise<JobInfo | null>,
): SiteBuildStatusService {
  const context = createServicePluginContext(createMockShell(), "site-builder");
  return new SiteBuildStatusService(
    context.runtimeState,
    getStatus ? { getStatus } : context.jobs,
  );
}

function processingJob(id: string): JobInfo {
  const now = Date.parse("2026-07-16T09:00:01.000Z");
  return {
    id,
    type: "site-builder:site-build",
    data: "{}",
    status: "processing",
    source: "site-builder",
    priority: 0,
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    createdAt: now - 1_000,
    scheduledFor: now - 1_000,
    startedAt: now,
    completedAt: null,
    attemptId: "attempt",
    workerSlotId: "worker",
    workerSessionId: "session",
    leaseExpiresAt: now + 60_000,
    attemptHeartbeatAt: now,
    runtimeUpdatedAt: now,
    metadata: {
      rootJobId: id,
      operationType: "content_operations",
    },
    progress: null,
  };
}

describe("SiteBuildStatusService", () => {
  it("tracks one build through request, queue, execution, and success", async () => {
    const service = createStatusService(async (jobId) => processingJob(jobId));
    await service.initialize();

    await service.markRequested("preview", "2026-07-16T09:00:00.000Z");
    await service.markQueued("preview", "job-preview");
    await service.markBuilding(
      "preview",
      "job-preview",
      "2026-07-16T09:00:01.000Z",
    );

    expect((await service.getSnapshot()).environments[0]?.active).toEqual({
      jobId: "job-preview",
      state: "building",
      requestedAt: "2026-07-16T09:00:00.000Z",
      startedAt: "2026-07-16T09:00:01.000Z",
    });

    await service.markSuccess(
      "preview",
      "job-preview",
      18,
      ["One image was reused"],
      "2026-07-16T09:00:04.000Z",
    );

    const snapshot = await service.getSnapshot();
    expect(snapshot.environments[0]).toMatchObject({
      environment: "preview",
      lastSuccess: {
        jobId: "job-preview",
        routesBuilt: 18,
        warnings: ["One image was reused"],
      },
    });
    expect(snapshot.environments[0]?.active).toBeUndefined();
    expect(snapshot.recentBuilds).toEqual([
      {
        jobId: "job-preview",
        environment: "preview",
        outcome: "succeeded",
        completedAt: "2026-07-16T09:00:04.000Z",
        routesBuilt: 18,
        warnings: ["One image was reused"],
      },
    ]);
  });

  it("preserves the last success when a later build fails", async () => {
    const service = createStatusService();
    await service.markSuccess(
      "production",
      "job-live-1",
      12,
      [],
      "2026-07-16T08:00:00.000Z",
    );
    await service.markFailure(
      "production",
      "job-live-2",
      "Template failed",
      "2026-07-16T09:00:00.000Z",
    );

    const production = (await service.getSnapshot()).environments[1];
    expect(production?.lastSuccess?.jobId).toBe("job-live-1");
    expect(production?.lastFailure).toMatchObject({
      jobId: "job-live-2",
      message: "Template failed",
    });
  });

  it("records unchanged inputs as skipped without manufacturing a successful render", async () => {
    const service = createStatusService();
    await service.markSuccess(
      "production",
      "job-live-1",
      12,
      [],
      "2026-07-16T08:00:00.000Z",
    );
    await service.markFailure(
      "production",
      "job-live-2",
      "Template failed",
      "2026-07-16T09:00:00.000Z",
    );
    await service.markQueued("production", "job-live-3");

    await service.markSkipped(
      "production",
      "job-live-3",
      12,
      "2026-07-16T10:00:00.000Z",
    );

    const snapshot = await service.getSnapshot();
    const production = snapshot.environments[1];
    expect(production?.active).toBeUndefined();
    expect(production?.lastSuccess?.jobId).toBe("job-live-1");
    expect(production?.lastFailure?.jobId).toBe("job-live-2");
    expect(snapshot.recentBuilds[0]).toEqual({
      jobId: "job-live-3",
      environment: "production",
      outcome: "skipped",
      completedAt: "2026-07-16T10:00:00.000Z",
      routesBuilt: 12,
      message: "Site inputs were unchanged; no render was published",
    });
  });

  it("reconciles terminal queue truth every time a snapshot is loaded", async () => {
    const context = createServicePluginContext(
      createMockShell(),
      "site-builder",
    );
    const completedAt = Date.parse("2026-07-16T09:00:04.000Z");
    const terminalJob: JobInfo = {
      id: "job-preview",
      type: "site-builder:site-build",
      data: "{}",
      status: "completed",
      source: "site-builder",
      priority: 0,
      retryCount: 0,
      maxRetries: 3,
      lastError: null,
      createdAt: completedAt - 4_000,
      scheduledFor: completedAt - 4_000,
      startedAt: completedAt - 3_000,
      completedAt,
      attemptId: null,
      workerSlotId: null,
      workerSessionId: null,
      leaseExpiresAt: null,
      attemptHeartbeatAt: null,
      runtimeUpdatedAt: completedAt,
      metadata: {
        rootJobId: "job-preview",
        operationType: "content_operations",
      },
      progress: null,
      result: {
        success: true,
        routesBuilt: 18,
        environment: "preview",
        outputDir: "./dist/site-preview",
      },
    };
    const getStatus = mock(async () => terminalJob);
    const service = new SiteBuildStatusService(context.runtimeState, {
      getStatus,
    });
    await service.markQueued("preview", terminalJob.id);

    const snapshot = await service.getSnapshot();

    expect(getStatus).toHaveBeenCalledWith(terminalJob.id);
    expect(snapshot.environments[0]?.active).toBeUndefined();
    expect(snapshot.environments[0]).toMatchObject({
      environment: "preview",
      lastSuccess: {
        jobId: terminalJob.id,
        completedAt: "2026-07-16T09:00:04.000Z",
        routesBuilt: 18,
      },
    });
  });

  it("records cancellation without clearing a newer active build", async () => {
    const service = createStatusService(async (jobId) => processingJob(jobId));
    await service.markBuilding(
      "preview",
      "job-old",
      "2026-07-16T09:00:00.000Z",
    );
    await service.markBuilding(
      "preview",
      "job-new",
      "2026-07-16T09:00:01.000Z",
    );
    await service.markCancelled(
      "preview",
      "job-old",
      "Superseded by a newer preview site build",
      "2026-07-16T09:00:02.000Z",
    );

    const snapshot = await service.getSnapshot();
    expect(snapshot.environments[0]).toMatchObject({
      active: { jobId: "job-new", state: "building" },
      lastCancellation: {
        jobId: "job-old",
        message: "Superseded by a newer preview site build",
      },
    });
    expect(snapshot.recentBuilds[0]).toMatchObject({
      jobId: "job-old",
      outcome: "cancelled",
    });
  });

  it("clears an unrecoverable debounced request during initialization", async () => {
    const context = createServicePluginContext(
      createMockShell(),
      "site-builder",
    );
    const first = new SiteBuildStatusService(
      context.runtimeState,
      context.jobs,
    );
    await first.markRequested("preview", "2026-07-16T09:00:00.000Z");

    const restarted = new SiteBuildStatusService(
      context.runtimeState,
      context.jobs,
    );
    await restarted.initialize();

    expect(
      (await restarted.getSnapshot()).environments[0]?.active,
    ).toBeUndefined();
  });

  it("keeps only five recent terminal results", async () => {
    const service = createStatusService();
    for (let index = 0; index < 7; index += 1) {
      await service.markSuccess(
        "preview",
        `job-${index}`,
        index,
        [],
        `2026-07-16T09:00:0${index}.000Z`,
      );
    }

    expect(
      (await service.getSnapshot()).recentBuilds.map((build) => build.jobId),
    ).toEqual(["job-6", "job-5", "job-4", "job-3", "job-2"]);
  });
});
