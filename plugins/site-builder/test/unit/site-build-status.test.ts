import { describe, expect, it } from "bun:test";
import { createServicePluginContext } from "@brains/plugins/test";
import { createMockShell } from "@brains/test-utils";
import { SiteBuildStatusService } from "../../src/lib/site-build-status";

function createStatusService(): SiteBuildStatusService {
  const context = createServicePluginContext(createMockShell(), "site-builder");
  return new SiteBuildStatusService(context.runtimeState, context.jobs);
}

describe("SiteBuildStatusService", () => {
  it("tracks one build through request, queue, execution, and success", async () => {
    const service = createStatusService();
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

  it("records cancellation without clearing a newer active build", async () => {
    const service = createStatusService();
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
