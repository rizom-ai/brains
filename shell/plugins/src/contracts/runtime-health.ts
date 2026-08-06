import { z } from "@brains/utils/zod";

export interface RuntimeHealthCheck {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  message?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface RuntimeQueueSignals {
  totals: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  byType: Array<{
    type: string;
    status: "pending" | "processing" | "completed" | "failed";
    count: number;
  }>;
  oldestPendingAgeMs: number | null;
  oldestProcessingAgeMs: number | null;
  staleLeaseCount: number;
  workerSessions: RuntimeWorkerSignals;
}

export interface RuntimeWorkerSignals {
  total: number;
  active: number;
  stale: number;
  latestHeartbeatAgeMs: number | null;
}

export interface RuntimeProjectionCircuitSignal {
  projectionId: string;
  reason: string;
  openedAt: number;
  expiresAt: number;
}

export interface RuntimeProjectionSignals {
  initialized: boolean;
  trackedRoots: number;
  openCircuits: RuntimeProjectionCircuitSignal[];
}

export interface RuntimeResourceSignals {
  memory: {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
  };
  fileDescriptors: number | null;
  processes: {
    total: number | null;
    zombies: number | null;
  };
  queue: RuntimeQueueSignals | null;
  projection: RuntimeProjectionSignals;
  worker: RuntimeWorkerSignals;
}

export interface RuntimeReadiness {
  status: "ready" | "not_ready";
  operationalStatus: "operational" | "degraded";
  checkedAt: string;
  checks: RuntimeHealthCheck[];
  resources: RuntimeResourceSignals;
}

export const RuntimeHealthCheckSchema: z.ZodType<RuntimeHealthCheck> = z.object(
  {
    name: z.string().min(1),
    status: z.enum(["healthy", "degraded", "unhealthy"]),
    message: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  },
);

export const RuntimeQueueSignalsSchema: z.ZodType<RuntimeQueueSignals> =
  z.object({
    totals: z.object({
      pending: z.number().int().nonnegative(),
      processing: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    }),
    byType: z.array(
      z.object({
        type: z.string().min(1),
        status: z.enum(["pending", "processing", "completed", "failed"]),
        count: z.number().int().nonnegative(),
      }),
    ),
    oldestPendingAgeMs: z.number().nonnegative().nullable(),
    oldestProcessingAgeMs: z.number().nonnegative().nullable(),
    staleLeaseCount: z.number().int().nonnegative(),
    workerSessions: z.object({
      total: z.number().int().nonnegative(),
      active: z.number().int().nonnegative(),
      stale: z.number().int().nonnegative(),
      latestHeartbeatAgeMs: z.number().nonnegative().nullable(),
    }),
  });

export const RuntimeResourceSignalsSchema: z.ZodType<RuntimeResourceSignals> =
  z.object({
    memory: z.object({
      rssBytes: z.number().int().nonnegative(),
      heapUsedBytes: z.number().int().nonnegative(),
      heapTotalBytes: z.number().int().nonnegative(),
    }),
    fileDescriptors: z.number().int().nonnegative().nullable(),
    processes: z.object({
      total: z.number().int().nonnegative().nullable(),
      zombies: z.number().int().nonnegative().nullable(),
    }),
    queue: RuntimeQueueSignalsSchema.nullable(),
    projection: z.object({
      initialized: z.boolean(),
      trackedRoots: z.number().int().nonnegative(),
      openCircuits: z.array(
        z.object({
          projectionId: z.string().min(1),
          reason: z.string().min(1),
          openedAt: z.number().int().nonnegative(),
          expiresAt: z.number().int().nonnegative(),
        }),
      ),
    }),
    worker: z.object({
      total: z.number().int().nonnegative(),
      active: z.number().int().nonnegative(),
      stale: z.number().int().nonnegative(),
      latestHeartbeatAgeMs: z.number().nonnegative().nullable(),
    }),
  });

export const RuntimeReadinessSchema: z.ZodType<RuntimeReadiness> = z.object({
  status: z.enum(["ready", "not_ready"]),
  operationalStatus: z.enum(["operational", "degraded"]),
  checkedAt: z.iso.datetime(),
  checks: z.array(RuntimeHealthCheckSchema),
  resources: RuntimeResourceSignalsSchema,
});
