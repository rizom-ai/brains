import { describe, expect, it, mock } from "bun:test";
import type { ServiceRecentJob } from "@brains/plugins";
import {
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";

import {
  SiteBuildStatusService,
  type SiteBuildJobReads,
} from "../../src/lib/site-build-status";

/** A queue that knows nothing, unless a test says what it knows. */
const NO_JOBS: SiteBuildJobReads = {
  find: async (): Promise<null> => null,
  recent: async (): Promise<[]> => [],
};

function createStatusService(
  jobs: Partial<SiteBuildJobReads> = {},
): SiteBuildStatusService {
  const context = createServicePluginContext(createMockShell(), "site-builder");
  return new SiteBuildStatusService(context.runtimeState, {
    find: jobs.find ?? NO_JOBS.find,
    recent: jobs.recent ?? NO_JOBS.recent,
  });
}

const TERMINAL_AT = Date.parse("2026-07-16T09:00:04.000Z");

function siteBuildJob(
  overrides: Partial<ServiceRecentJob> = {},
): ServiceRecentJob {
  return {
    id: "job-preview",
    type: "site-build",
    data: { environment: "preview" },
    status: "completed",
    createdAt: TERMINAL_AT - 4_000,
    startedAt: TERMINAL_AT - 3_000,
    completedAt: TERMINAL_AT,
    result: {
      success: true,
      routesBuilt: 18,
      environment: "preview",
      outputDir: "./dist/site-preview",
    },
    ...overrides,
  };
}

function processingJob(id: string): ServiceRecentJob {
  return siteBuildJob({
    id,
    status: "processing",
    startedAt: Date.parse("2026-07-16T09:00:01.000Z"),
    result: null,
  });
}

describe("SiteBuildStatusService", () => {
  it("tracks one build through request, queue, execution, and success", async () => {
    const service = createStatusService({
      find: async (jobId) => processingJob(jobId),
    });
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
    const terminalJob = siteBuildJob();
    const find = mock(async () => terminalJob);
    const service = new SiteBuildStatusService(context.runtimeState, {
      find,
      recent: mock(async () => []),
    });
    await service.markQueued("preview", terminalJob.id);

    const snapshot = await service.getSnapshot();

    expect(find).toHaveBeenCalledWith(terminalJob.id);
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
    const service = createStatusService({
      find: async (jobId) => processingJob(jobId),
    });
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
    const first = new SiteBuildStatusService(context.runtimeState, NO_JOBS);
    await first.markRequested("preview", "2026-07-16T09:00:00.000Z");

    const restarted = new SiteBuildStatusService(context.runtimeState, NO_JOBS);
    await restarted.initialize();

    expect(
      (await restarted.getSnapshot()).environments[0]?.active,
    ).toBeUndefined();
  });

  it("heals a lost lifecycle write from the queue's recent jobs", async () => {
    const job = siteBuildJob({ id: "job-lost" });
    const service = createStatusService({ recent: async () => [job] });

    const snapshot = await service.getSnapshot();

    expect(snapshot.environments[0]?.lastSuccess).toMatchObject({
      jobId: "job-lost",
      completedAt: "2026-07-16T09:00:04.000Z",
      routesBuilt: 18,
    });
    expect(snapshot.recentBuilds[0]?.jobId).toBe("job-lost");
  });

  it("restores a running build lost from the projection", async () => {
    const job = processingJob("job-running");
    const service = createStatusService({
      find: async () => job,
      recent: async () => [job],
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.environments[0]?.active).toMatchObject({
      jobId: "job-running",
      state: "building",
    });
  });

  it("clears an active entry whose job the queue no longer knows", async () => {
    const service = createStatusService({});
    await service.markQueued("preview", "job-vanished");

    const snapshot = await service.getSnapshot();

    expect(snapshot.environments[0]?.active).toBeUndefined();
  });

  it("does not resurrect an older terminal job over newer recorded state", async () => {
    const older = siteBuildJob({
      id: "job-old",
      completedAt: Date.parse("2026-07-16T08:00:00.000Z"),
    });
    const service = createStatusService({ recent: async () => [older] });
    await service.markSuccess(
      "preview",
      "job-new",
      5,
      [],
      "2026-07-16T09:00:00.000Z",
    );

    const snapshot = await service.getSnapshot();

    expect(snapshot.environments[0]?.lastSuccess?.jobId).toBe("job-new");
    expect(snapshot.recentBuilds.map((build) => build.jobId)).toEqual([
      "job-new",
    ]);
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
