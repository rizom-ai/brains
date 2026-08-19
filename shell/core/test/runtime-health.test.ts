import { describe, expect, it } from "bun:test";
import type {
  ProjectionBatchDiagnostics,
  ProjectionIncidentDiagnostics,
  ProjectionWave,
  ProjectionWaveRule,
} from "@brains/entity-service";
import type { JobInfo, JobQueueDiagnostics } from "@brains/job-queue";
import {
  getRuntimeReadiness,
  type RuntimeReadinessOptions,
} from "../src/runtime-health";

type RuntimeDependencies = Pick<
  RuntimeReadinessOptions,
  | "entityService"
  | "jobQueueService"
  | "daemonRegistry"
  | "projectionRuntimeSupervisor"
  | "operationalHealthRegistry"
>;

function createDependencies(): RuntimeDependencies {
  const entityService: RuntimeDependencies["entityService"] = {
    getEntityCounts: async () => [{ entityType: "note", count: 2 }],
    getProjectionStore: () => ({
      getActiveWave: async (): Promise<ProjectionWave | null> => null,
      listWaveRules: async (): Promise<ProjectionWaveRule[]> => [],
      getUnresolvedProjectionIncidentDiagnostics: async () => ({
        total: 0,
        incidents: [],
      }),
    }),
  };
  const jobQueueService = {
    getDiagnostics: async (): Promise<JobQueueDiagnostics> => ({
      totals: { pending: 1, processing: 0, completed: 3, failed: 0 },
      byType: [{ type: "note:embedding", status: "pending", count: 1 }],
      oldestPendingAgeMs: 25,
      duePending: 0,
      oldestDuePendingAgeMs: null,
      latestClaimAgeMs: null,
      oldestProcessingAgeMs: null,
      staleLeaseCount: 0,
      workerSessions: {
        total: 1,
        active: 1,
        stale: 0,
        latestHeartbeatAgeMs: 1_000,
      },
    }),
    getStatus: async (): Promise<JobInfo | null> => null,
  };
  return {
    entityService,
    jobQueueService,
    projectionRuntimeSupervisor: {
      getDiagnostics: async () => ({
        status: "healthy",
        initialized: true,
        trackedRoots: 1,
        openCircuits: [],
      }),
    },
    operationalHealthRegistry: {
      getChecks: async () => [],
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
    expect(readiness.operationalStatus).toBe("operational");
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
          name: "job-queue-progress",
          status: "healthy",
        }),
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
        duePending: 0,
        oldestDuePendingAgeMs: null,
        latestClaimAgeMs: null,
        oldestProcessingAgeMs: null,
        staleLeaseCount: 0,
        workerSessions: {
          total: 1,
          active: 1,
          stale: 0,
          latestHeartbeatAgeMs: 1_000,
        },
      },
      projection: {
        initialized: true,
        trackedRoots: 1,
        openCircuits: [],
      },
      worker: {
        total: 1,
        active: 1,
        stale: 0,
        latestHeartbeatAgeMs: 1_000,
      },
    });
  });

  it("keeps routing ready while worker, lease, and daemon operation is degraded", async () => {
    const dependencies = createDependencies();
    dependencies.jobQueueService.getDiagnostics = async (): Promise<
      Awaited<
        ReturnType<RuntimeDependencies["jobQueueService"]["getDiagnostics"]>
      >
    > => ({
      ...(await createDependencies().jobQueueService.getDiagnostics()),
      staleLeaseCount: 2,
      workerSessions: {
        total: 1,
        active: 0,
        stale: 1,
        latestHeartbeatAgeMs: 20_000,
      },
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

    expect(readiness.status).toBe("ready");
    expect(readiness.operationalStatus).toBe("degraded");
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "job-worker",
          status: "degraded",
          message: "No live worker session",
        }),
        expect.objectContaining({
          name: "attempt-leases",
          status: "degraded",
        }),
        expect.objectContaining({ name: "daemons", status: "degraded" }),
      ]),
    );
  });

  it("degrades operation when due work has not been claimed", async () => {
    const dependencies = createDependencies();
    dependencies.jobQueueService.getDiagnostics =
      async (): Promise<JobQueueDiagnostics> => ({
        ...(await createDependencies().jobQueueService.getDiagnostics()),
        duePending: 2,
        oldestDuePendingAgeMs: 120_000,
        latestClaimAgeMs: 120_000,
      });

    const readiness = await getRuntimeReadiness({
      ...dependencies,
      ...runtimeOptions,
    });

    expect(readiness.operationalStatus).toBe("degraded");
    expect(readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "job-queue-progress",
        status: "degraded",
        message: "2 due job(s) are not being claimed",
      }),
    );
  });

  it("keeps due backlog operational while work is processing", async () => {
    const dependencies = createDependencies();
    dependencies.jobQueueService.getDiagnostics =
      async (): Promise<JobQueueDiagnostics> => ({
        ...(await createDependencies().jobQueueService.getDiagnostics()),
        totals: { pending: 2, processing: 1, completed: 3, failed: 0 },
        duePending: 2,
        oldestDuePendingAgeMs: 300_000,
        latestClaimAgeMs: 300_000,
      });

    const readiness = await getRuntimeReadiness({
      ...dependencies,
      ...runtimeOptions,
    });

    expect(readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "job-queue-progress",
        status: "healthy",
      }),
    );
  });

  it("degrades operation when an active projection wave has a terminal queued job", async () => {
    const dependencies = createDependencies();
    const entityService: RuntimeDependencies["entityService"] = {
      ...dependencies.entityService,
      getProjectionStore: () => ({
        getActiveWave: async (): Promise<ProjectionWave> => ({
          id: "wave-1",
          cutoffGeneration: 42,
          graphFingerprint: "graph-1",
          admissionEpoch: 0,
          status: "running",
          startedAt: 100,
          completedAt: null,
        }),
        listWaveRules: async (): Promise<ProjectionWaveRule[]> => [
          {
            waveId: "wave-1",
            ruleId: "topics-projection",
            targetType: "topic",
            level: 0,
            jobId: "job-terminal",
            status: "queued",
            inputFingerprint: null,
            changedTargets: [],
          },
        ],
        getUnresolvedProjectionIncidentDiagnostics: async () => ({
          total: 0,
          incidents: [],
        }),
      }),
    };
    const jobQueueService = {
      ...dependencies.jobQueueService,
      getStatus: async (): Promise<JobInfo> => ({
        id: "job-terminal",
        type: "shell:projection-rule",
        data: "{}",
        status: "failed",
        source: "projection-scheduler",
        priority: 0,
        retryCount: 3,
        maxRetries: 3,
        lastError: "No handler registered",
        createdAt: 100,
        scheduledFor: 100,
        startedAt: 100,
        completedAt: 200,
        attemptId: null,
        workerSlotId: null,
        workerSessionId: null,
        leaseExpiresAt: null,
        attemptHeartbeatAt: null,
        runtimeUpdatedAt: 200,
        metadata: {
          rootJobId: "projection-wave:wave-1",
          operationType: "data_processing",
        },
        progress: null,
        result: null,
      }),
    };

    const readiness = await getRuntimeReadiness({
      ...dependencies,
      entityService,
      jobQueueService,
      ...runtimeOptions,
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.operationalStatus).toBe("degraded");
    expect(readiness.checks).toContainEqual({
      name: "projection-waves",
      status: "degraded",
      message: "Projection wave wave-1 has 1 stranded rule job(s)",
      details: {
        waveId: "wave-1",
        strandedRules: [
          {
            ruleId: "topics-projection",
            jobId: "job-terminal",
            jobStatus: "failed",
          },
        ],
      },
    });
  });

  it("degrades operation for plugin checks without changing routing readiness", async () => {
    const dependencies = createDependencies();
    dependencies.operationalHealthRegistry.getChecks = async (): Promise<
      Awaited<
        ReturnType<
          RuntimeDependencies["operationalHealthRegistry"]["getChecks"]
        >
      >
    > => [
      {
        name: "directory-sync:git-progress",
        status: "unhealthy",
        message: "Directory Git pull has made no progress for 150001ms",
        details: { inactivityMs: 150_001, staleAfterMs: 150_000 },
      },
    ];

    const readiness = await getRuntimeReadiness({
      ...dependencies,
      ...runtimeOptions,
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.operationalStatus).toBe("degraded");
    expect(readiness.checks).toContainEqual({
      name: "directory-sync:git-progress",
      status: "unhealthy",
      message: "Directory Git pull has made no progress for 150001ms",
      details: { inactivityMs: 150_001, staleAfterMs: 150_000 },
    });
  });

  it("reports a bounded sample of durable terminal incidents after the active wave is gone", async () => {
    const dependencies = createDependencies();
    let requestedIncidentLimit: number | undefined;
    dependencies.entityService = {
      ...dependencies.entityService,
      getProjectionStore: (): ReturnType<
        RuntimeDependencies["entityService"]["getProjectionStore"]
      > => ({
        getActiveWave: async (): Promise<ProjectionWave | null> => null,
        listWaveRules: async (): Promise<ProjectionWaveRule[]> => [],
        getUnresolvedProjectionIncidentDiagnostics: async (
          limit,
        ): Promise<ProjectionIncidentDiagnostics> => {
          requestedIncidentLimit = limit;
          return {
            total: 12,
            incidents: [
              {
                waveId: "wave-failed",
                ruleId: "topics-projection",
                jobId: "job-terminal",
                failureReason: "Projection rule job exhausted retries",
                recoveryGeneration: 42,
                createdAt: 100,
                resolvedAt: null,
              },
            ],
          };
        },
      }),
    };

    const readiness = await getRuntimeReadiness({
      ...dependencies,
      ...runtimeOptions,
    });

    expect(requestedIncidentLimit).toBe(10);
    expect(readiness.operationalStatus).toBe("degraded");
    expect(readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "projection-waves",
        status: "degraded",
        message: "12 unresolved terminal projection incident(s)",
        details: expect.objectContaining({
          incidentCount: 12,
          incidentsTruncated: true,
        }),
      }),
    );
  });

  it("keeps a live durable projection batch operational regardless of age", async () => {
    const dependencies = createDependencies();
    const baseStore = dependencies.entityService.getProjectionStore();
    const readiness = await getRuntimeReadiness({
      ...dependencies,
      entityService: {
        ...dependencies.entityService,
        getProjectionStore: () => ({
          ...baseStore,
          getProjectionBatchDiagnostics:
            async (): Promise<ProjectionBatchDiagnostics> => ({
              preparing: 0,
              open: 1,
              abandoned: 0,
              expiredCallbackLeases: 0,
              oldestActiveAgeMs: 60_000,
              oldestProgressAgeMs: 60_000,
            }),
        }),
      },
      ...runtimeOptions,
    });

    expect(readiness.operationalStatus).toBe("operational");
    expect(readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "projection-waves",
        status: "healthy",
      }),
    );
  });

  it("degrades operation for an expired callback projection lease", async () => {
    const dependencies = createDependencies();
    const baseStore = dependencies.entityService.getProjectionStore();
    const readiness = await getRuntimeReadiness({
      ...dependencies,
      entityService: {
        ...dependencies.entityService,
        getProjectionStore: () => ({
          ...baseStore,
          getProjectionBatchDiagnostics:
            async (): Promise<ProjectionBatchDiagnostics> => ({
              preparing: 0,
              open: 1,
              abandoned: 0,
              expiredCallbackLeases: 1,
              oldestActiveAgeMs: 31_000,
              oldestProgressAgeMs: 1_000,
            }),
        }),
      },
      ...runtimeOptions,
    });

    expect(readiness.operationalStatus).toBe("degraded");
    expect(readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "projection-waves",
        status: "degraded",
        message: "A callback projection batch lease has expired",
      }),
    );
  });

  it("reports unrecovered projection batch abandonment as degraded", async () => {
    const dependencies = createDependencies();
    const baseStore = dependencies.entityService.getProjectionStore();
    const readiness = await getRuntimeReadiness({
      ...dependencies,
      entityService: {
        ...dependencies.entityService,
        getProjectionStore: () => ({
          ...baseStore,
          getProjectionBatchDiagnostics:
            async (): Promise<ProjectionBatchDiagnostics> => ({
              preparing: 0,
              open: 0,
              abandoned: 1,
              expiredCallbackLeases: 0,
              oldestActiveAgeMs: null,
              oldestProgressAgeMs: null,
            }),
        }),
      },
      ...runtimeOptions,
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.operationalStatus).toBe("degraded");
    expect(readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "projection-waves",
        status: "degraded",
        details: {
          batches: expect.objectContaining({ abandoned: 1 }),
        },
      }),
    );
  });

  it("degrades operation while a projection circuit is open", async () => {
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

    expect(readiness.status).toBe("ready");
    expect(readiness.operationalStatus).toBe("degraded");
    expect(readiness.checks).toContainEqual({
      name: "projection-circuits",
      status: "degraded",
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
    expect(readiness.operationalStatus).toBe("degraded");
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
