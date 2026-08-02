import { describe, expect, it } from "bun:test";
import {
  getRuntimeReadiness,
  type RuntimeReadinessOptions,
} from "../src/runtime-health";

type RuntimeDependencies = Pick<
  RuntimeReadinessOptions,
  | "entityService"
  | "jobQueueService"
  | "jobQueueWorker"
  | "daemonRegistry"
  | "projectionRuntimeSupervisor"
>;

function createDependencies(): RuntimeDependencies {
  return {
    entityService: {
      getEntityCounts: async () => [{ entityType: "note", count: 2 }],
    },
    jobQueueService: {
      getDiagnostics: async () => ({
        totals: { pending: 1, processing: 0, completed: 3, failed: 0 },
        byType: [{ type: "note:embedding", status: "pending", count: 1 }],
        oldestPendingAgeMs: 25,
        oldestProcessingAgeMs: null,
        staleLeaseCount: 0,
      }),
    },
    jobQueueWorker: {
      getStats: () => ({
        processedJobs: 3,
        failedJobs: 0,
        activeJobs: 0,
        uptime: 1_000,
        isRunning: true,
        isHealthy: true,
      }),
    },
    projectionRuntimeSupervisor: {
      getDiagnostics: async () => ({
        status: "healthy",
        initialized: true,
        trackedRoots: 1,
        openCircuits: [],
      }),
    },
    daemonRegistry: {
      getStatuses: async () => [
        {
          name: "webserver",
          pluginId: "webserver",
          status: "running",
          health: { status: "healthy" },
        },
      ],
    },
  };
}

const runtimeOptions = {
  now: (): number => 1_753_876_800_000,
  memoryUsage: (): { rss: number; heapUsed: number; heapTotal: number } => ({
    rss: 100,
    heapUsed: 50,
    heapTotal: 75,
  }),
  readProcessSignals: async (): Promise<{
    fileDescriptors: number;
    processCount: number;
    zombieCount: number;
  }> => ({
    fileDescriptors: 12,
    processCount: 3,
    zombieCount: 0,
  }),
};

describe("getRuntimeReadiness", () => {
  it("reports healthy dependencies and bounded resource signals", async () => {
    const readiness = await getRuntimeReadiness({
      ...createDependencies(),
      ...runtimeOptions,
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.checkedAt).toBe("2025-07-30T12:00:00.000Z");
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "entity-database",
          status: "healthy",
        }),
        expect.objectContaining({
          name: "job-queue-database",
          status: "healthy",
        }),
        expect.objectContaining({ name: "job-worker", status: "healthy" }),
        expect.objectContaining({
          name: "attempt-leases",
          status: "healthy",
        }),
        expect.objectContaining({ name: "daemons", status: "healthy" }),
        expect.objectContaining({
          name: "projection-circuits",
          status: "healthy",
        }),
      ]),
    );
    expect(readiness.resources).toEqual({
      memory: { rssBytes: 100, heapUsedBytes: 50, heapTotalBytes: 75 },
      fileDescriptors: 12,
      processes: { total: 3, zombies: 0 },
      queue: {
        totals: { pending: 1, processing: 0, completed: 3, failed: 0 },
        byType: [{ type: "note:embedding", status: "pending", count: 1 }],
        oldestPendingAgeMs: 25,
        oldestProcessingAgeMs: null,
        staleLeaseCount: 0,
      },
      projection: {
        initialized: true,
        trackedRoots: 1,
        openCircuits: [],
      },
      worker: {
        isRunning: true,
        isHealthy: true,
        activeJobs: 0,
        processedJobs: 3,
        failedJobs: 0,
        uptimeMs: 1_000,
      },
    });
  });

  it("fails readiness for stale leases, unhealthy workers, and daemons", async () => {
    const dependencies = createDependencies();
    dependencies.jobQueueService.getDiagnostics = async (): Promise<
      Awaited<
        ReturnType<RuntimeDependencies["jobQueueService"]["getDiagnostics"]>
      >
    > => ({
      ...(await createDependencies().jobQueueService.getDiagnostics()),
      staleLeaseCount: 2,
    });
    dependencies.jobQueueWorker.getStats = (): ReturnType<
      RuntimeDependencies["jobQueueWorker"]["getStats"]
    > => ({
      processedJobs: 3,
      failedJobs: 1,
      activeJobs: 1,
      uptime: 1_000,
      isRunning: true,
      isHealthy: false,
      unhealthyReason: "handler ignored cancellation",
    });
    dependencies.daemonRegistry.getStatuses = async (): Promise<
      Awaited<ReturnType<RuntimeDependencies["daemonRegistry"]["getStatuses"]>>
    > => [
      {
        name: "directory-sync",
        pluginId: "directory-sync",
        status: "error",
        health: {
          status: "error",
          message: "sync stalled",
        },
      },
    ];

    const readiness = await getRuntimeReadiness({
      ...dependencies,
      ...runtimeOptions,
    });

    expect(readiness.status).toBe("not_ready");
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "job-worker",
          status: "unhealthy",
          message: "handler ignored cancellation",
        }),
        expect.objectContaining({
          name: "attempt-leases",
          status: "unhealthy",
        }),
        expect.objectContaining({ name: "daemons", status: "unhealthy" }),
      ]),
    );
  });

  it("fails readiness while a projection circuit is open", async () => {
    const dependencies = createDependencies();
    dependencies.projectionRuntimeSupervisor.getDiagnostics = async (): Promise<
      Awaited<
        ReturnType<
          RuntimeDependencies["projectionRuntimeSupervisor"]["getDiagnostics"]
        >
      >
    > => ({
      status: "unhealthy",
      initialized: true,
      trackedRoots: 2,
      openCircuits: [
        {
          projectionId: "topics-projection",
          reason: "projection job budget exceeded",
          openedAt: 100,
          expiresAt: 200,
        },
      ],
    });

    const readiness = await getRuntimeReadiness({
      ...dependencies,
      ...runtimeOptions,
    });

    expect(readiness.status).toBe("not_ready");
    expect(readiness.checks).toContainEqual({
      name: "projection-circuits",
      status: "unhealthy",
      message: "1 projection circuit(s) open",
      details: {
        circuits: [
          {
            projectionId: "topics-projection",
            reason: "projection job budget exceeded",
            openedAt: 100,
            expiresAt: 200,
          },
        ],
      },
    });
  });

  it("returns structured not-ready state when database probes fail", async () => {
    const dependencies = createDependencies();
    dependencies.entityService.getEntityCounts = async (): Promise<never> => {
      throw new Error("entity database offline");
    };
    dependencies.jobQueueService.getDiagnostics = async (): Promise<never> => {
      throw new Error("queue database offline");
    };

    const readiness = await getRuntimeReadiness({
      ...dependencies,
      ...runtimeOptions,
    });

    expect(readiness.status).toBe("not_ready");
    expect(readiness.resources.queue).toBeNull();
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "entity-database",
          status: "unhealthy",
          message: "entity database offline",
        }),
        expect.objectContaining({
          name: "job-queue-database",
          status: "unhealthy",
          message: "queue database offline",
        }),
      ]),
    );
  });
});
