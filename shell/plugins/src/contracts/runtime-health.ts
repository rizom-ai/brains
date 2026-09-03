import { z } from "@brains/utils/zod";

type RuntimeHealthCheckSchema = z.ZodObject<{
  name: z.ZodString;
  status: z.ZodEnum<{
    healthy: "healthy";
    degraded: "degraded";
    unhealthy: "unhealthy";
  }>;
  message: z.ZodOptional<z.ZodString>;
  details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}>;

export const RuntimeHealthCheckSchema: RuntimeHealthCheckSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  message: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type RuntimeHealthCheck = z.output<typeof RuntimeHealthCheckSchema>;

type RuntimeWorkerSignalsSchema = z.ZodObject<{
  total: z.ZodNumber;
  active: z.ZodNumber;
  stale: z.ZodNumber;
  latestHeartbeatAgeMs: z.ZodNullable<z.ZodNumber>;
}>;

const runtimeWorkerSignalsShape = {
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  stale: z.number().int().nonnegative(),
  latestHeartbeatAgeMs: z.number().nonnegative().nullable(),
};

type RuntimeQueueSignalsSchema = z.ZodObject<{
  totals: z.ZodObject<{
    pending: z.ZodNumber;
    processing: z.ZodNumber;
    completed: z.ZodNumber;
    failed: z.ZodNumber;
  }>;
  byType: z.ZodArray<
    z.ZodObject<{
      type: z.ZodString;
      status: z.ZodEnum<{
        pending: "pending";
        processing: "processing";
        completed: "completed";
        failed: "failed";
      }>;
      count: z.ZodNumber;
    }>
  >;
  oldestPendingAgeMs: z.ZodNullable<z.ZodNumber>;
  duePending: z.ZodNumber;
  oldestDuePendingAgeMs: z.ZodNullable<z.ZodNumber>;
  latestClaimAgeMs: z.ZodNullable<z.ZodNumber>;
  oldestProcessingAgeMs: z.ZodNullable<z.ZodNumber>;
  staleLeaseCount: z.ZodNumber;
  workerSessions: RuntimeWorkerSignalsSchema;
}>;

export const RuntimeQueueSignalsSchema: RuntimeQueueSignalsSchema = z.object({
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
  duePending: z.number().int().nonnegative(),
  oldestDuePendingAgeMs: z.number().nonnegative().nullable(),
  latestClaimAgeMs: z.number().nonnegative().nullable(),
  oldestProcessingAgeMs: z.number().nonnegative().nullable(),
  staleLeaseCount: z.number().int().nonnegative(),
  workerSessions: z.object(runtimeWorkerSignalsShape),
});

export type RuntimeQueueSignals = z.output<typeof RuntimeQueueSignalsSchema>;
export type RuntimeWorkerSignals = RuntimeQueueSignals["workerSessions"];

type RuntimeResourceSignalsSchema = z.ZodObject<{
  memory: z.ZodObject<{
    rssBytes: z.ZodNumber;
    heapUsedBytes: z.ZodNumber;
    heapTotalBytes: z.ZodNumber;
  }>;
  fileDescriptors: z.ZodNullable<z.ZodNumber>;
  processes: z.ZodObject<{
    total: z.ZodNullable<z.ZodNumber>;
    zombies: z.ZodNullable<z.ZodNumber>;
  }>;
  queue: z.ZodNullable<RuntimeQueueSignalsSchema>;
  projection: z.ZodObject<{
    initialized: z.ZodBoolean;
    trackedRoots: z.ZodNumber;
    openCircuits: z.ZodArray<
      z.ZodObject<{
        projectionId: z.ZodString;
        reason: z.ZodString;
        openedAt: z.ZodNumber;
        expiresAt: z.ZodNumber;
      }>
    >;
  }>;
  worker: RuntimeWorkerSignalsSchema;
}>;

export const RuntimeResourceSignalsSchema: RuntimeResourceSignalsSchema =
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
    worker: z.object(runtimeWorkerSignalsShape),
  });

export type RuntimeResourceSignals = z.output<
  typeof RuntimeResourceSignalsSchema
>;
export type RuntimeProjectionSignals = RuntimeResourceSignals["projection"];
export type RuntimeProjectionCircuitSignal =
  RuntimeProjectionSignals["openCircuits"][number];

type RuntimeReadinessSchema = z.ZodObject<{
  status: z.ZodEnum<{ ready: "ready"; not_ready: "not_ready" }>;
  operationalStatus: z.ZodEnum<{
    operational: "operational";
    degraded: "degraded";
  }>;
  checkedAt: z.ZodISODateTime;
  checks: z.ZodArray<RuntimeHealthCheckSchema>;
  resources: RuntimeResourceSignalsSchema;
}>;

export const RuntimeReadinessSchema: RuntimeReadinessSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  operationalStatus: z.enum(["operational", "degraded"]),
  checkedAt: z.iso.datetime(),
  checks: z.array(RuntimeHealthCheckSchema),
  resources: RuntimeResourceSignalsSchema,
});

export type RuntimeReadiness = z.output<typeof RuntimeReadinessSchema>;
