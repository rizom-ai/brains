import type { ProgressNotification } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import {
  DeduplicationStrategyEnum,
  JobContextInputSchema,
} from "./schema/types";
import { JobInfoSchema } from "./types";
import type {
  JobClaimOptions,
  JobInfo,
  JobQueueDiagnostics,
  JobQueueEnqueueRequest,
  JobQueueStats,
  JobRuntimeUpdate,
  JobRuntimeUpdateCursor,
} from "./types";

export const JOB_QUEUE_RPC_SERVICE = "job-queue";

export interface JobQueueRpcTransport {
  initialize(): Promise<void>;
  request(
    payload: JobQueueRpcRequest,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<unknown>;
  close(): void;
}

export type JobQueueRpcRequest =
  | { operation: "enqueue"; request: JobQueueEnqueueRequest }
  | {
      operation: "dequeue";
      claim?: JobClaimOptions | undefined;
      executableTypes: string[];
    }
  | {
      operation: "startWorkerSession";
      workerSlotId: string;
      workerSessionId: string;
      workerSessionTimeoutMs: number;
    }
  | {
      operation: "heartbeatWorkerSession";
      workerSlotId: string;
      workerSessionId: string;
      workerSessionTimeoutMs: number;
    }
  | {
      operation: "endWorkerSession";
      workerSlotId: string;
      workerSessionId: string;
    }
  | {
      operation: "renewAttemptLease";
      jobId: string;
      attemptId: string;
      leaseDurationMs: number;
    }
  | {
      operation: "recordAttemptProgress";
      jobId: string;
      attemptId: string;
      progress: ProgressNotification;
    }
  | {
      operation: "complete";
      jobId: string;
      result?: unknown;
      attemptId?: string | undefined;
    }
  | {
      operation: "update";
      jobId: string;
      data: unknown;
      attemptId?: string | undefined;
    }
  | {
      operation: "fail";
      jobId: string;
      error: { name: string; message: string; stack?: string | undefined };
      attemptId?: string | undefined;
    }
  | { operation: "getStatus"; jobId: string }
  | { operation: "getStatusByEntityId"; entityId: string }
  | { operation: "getStats" }
  | { operation: "getDiagnostics"; now?: number | undefined }
  | {
      operation: "getRuntimeUpdates";
      cursor: JobRuntimeUpdateCursor;
      limit: number;
    }
  | { operation: "cleanup"; olderThanMs: number }
  | { operation: "getActiveJobs"; types?: string[] | undefined }
  | { operation: "getFailedJobs"; types?: string[] | undefined };

const progressSchema = z.strictObject({
  progress: z.number(),
  total: z.number().optional(),
  message: z.string().optional(),
  rate: z.number().optional(),
  eta: z.number().optional(),
});

const claimSchema: z.ZodType<JobClaimOptions, unknown> = z.strictObject({
  workerSlotId: z.string().min(1),
  workerSessionId: z.string().min(1),
  leaseDurationMs: z.number().int().positive(),
});

const metadataSchema = z.intersection(
  z.record(z.string(), z.unknown()),
  JobContextInputSchema,
);

export const JobQueueEnqueueRequestSchema: z.ZodType<
  JobQueueEnqueueRequest,
  unknown
> = z.strictObject({
  type: z.string().min(1),
  data: z.unknown(),
  idempotencyKey: z.string().min(1).optional(),
  options: z
    .strictObject({
      priority: z.number().optional(),
      maxRetries: z.number().int().nonnegative().optional(),
      delayMs: z.number().nonnegative().optional(),
      source: z.string().min(1),
      metadata: metadataSchema,
      deduplication: DeduplicationStrategyEnum.optional(),
      deduplicationKey: z.string().optional(),
      projection: z
        .strictObject({
          id: z.string().min(1),
          sourceEntity: z
            .strictObject({
              entityType: z.string().min(1),
              entityId: z.string().min(1),
              contentHash: z.string().min(1).optional(),
            })
            .optional(),
        })
        .optional(),
      rootJobId: z.string().optional(),
    })
    .optional(),
});

const stringPairSchema = {
  workerSlotId: z.string().min(1),
  workerSessionId: z.string().min(1),
};
const attemptSchema = {
  jobId: z.string().min(1),
  attemptId: z.string().min(1),
};
const optionalAttemptIdSchema = z.string().min(1).optional();

export const JobQueueRpcRequestSchema: z.ZodType<JobQueueRpcRequest, unknown> =
  z.discriminatedUnion("operation", [
    z.strictObject({
      operation: z.literal("enqueue"),
      request: JobQueueEnqueueRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("dequeue"),
      claim: claimSchema.optional(),
      executableTypes: z.array(z.string().min(1)),
    }),
    z.strictObject({
      operation: z.literal("startWorkerSession"),
      ...stringPairSchema,
      workerSessionTimeoutMs: z.number().int().positive(),
    }),
    z.strictObject({
      operation: z.literal("heartbeatWorkerSession"),
      ...stringPairSchema,
      workerSessionTimeoutMs: z.number().int().positive(),
    }),
    z.strictObject({
      operation: z.literal("endWorkerSession"),
      ...stringPairSchema,
    }),
    z.strictObject({
      operation: z.literal("renewAttemptLease"),
      ...attemptSchema,
      leaseDurationMs: z.number().int().positive(),
    }),
    z.strictObject({
      operation: z.literal("recordAttemptProgress"),
      ...attemptSchema,
      progress: progressSchema,
    }),
    z.strictObject({
      operation: z.literal("complete"),
      jobId: z.string().min(1),
      result: z.unknown().optional(),
      attemptId: optionalAttemptIdSchema,
    }),
    z.strictObject({
      operation: z.literal("update"),
      jobId: z.string().min(1),
      data: z.unknown(),
      attemptId: optionalAttemptIdSchema,
    }),
    z.strictObject({
      operation: z.literal("fail"),
      jobId: z.string().min(1),
      error: z.strictObject({
        name: z.string().min(1),
        message: z.string(),
        stack: z.string().optional(),
      }),
      attemptId: optionalAttemptIdSchema,
    }),
    z.strictObject({
      operation: z.literal("getStatus"),
      jobId: z.string().min(1),
    }),
    z.strictObject({
      operation: z.literal("getStatusByEntityId"),
      entityId: z.string().min(1),
    }),
    z.strictObject({ operation: z.literal("getStats") }),
    z.strictObject({
      operation: z.literal("getDiagnostics"),
      now: z.number().optional(),
    }),
    z.strictObject({
      operation: z.literal("getRuntimeUpdates"),
      cursor: z.strictObject({
        updatedAt: z.number().nonnegative(),
        jobId: z.string(),
      }),
      limit: z.number().int().nonnegative(),
    }),
    z.strictObject({
      operation: z.literal("cleanup"),
      olderThanMs: z.number().nonnegative(),
    }),
    z.strictObject({
      operation: z.literal("getActiveJobs"),
      types: z.array(z.string()).optional(),
    }),
    z.strictObject({
      operation: z.literal("getFailedJobs"),
      types: z.array(z.string()).optional(),
    }),
  ]);

export function parseJobQueueEnqueueRequest(
  input: unknown,
): JobQueueEnqueueRequest {
  return JobQueueEnqueueRequestSchema.parse(input);
}

export function parseJobQueueRpcRequest(input: unknown): JobQueueRpcRequest {
  return JobQueueRpcRequestSchema.parse(input);
}

const jobInfoListSchema: z.ZodType<JobInfo[], unknown> = z.array(JobInfoSchema);

const statsSchema: z.ZodType<JobQueueStats, unknown> = z.strictObject({
  pending: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

const diagnosticsSchema: z.ZodType<JobQueueDiagnostics, unknown> =
  z.strictObject({
    totals: z.strictObject({
      pending: z.number().int().nonnegative(),
      processing: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
    }),
    byType: z.array(
      z.strictObject({
        type: z.string(),
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
    workerSessions: z.strictObject({
      total: z.number().int().nonnegative(),
      active: z.number().int().nonnegative(),
      stale: z.number().int().nonnegative(),
      latestHeartbeatAgeMs: z.number().nonnegative().nullable(),
    }),
  });

const runtimeUpdatesSchema: z.ZodType<JobRuntimeUpdate[], unknown> = z.array(
  z.strictObject({
    job: JobInfoSchema,
    cursor: z.strictObject({
      updatedAt: z.number(),
      jobId: z.string(),
    }),
  }),
);

const nullableJobInfoSchema: z.ZodType<JobInfo | null, unknown> =
  JobInfoSchema.nullable();
const booleanResultSchema = z.boolean();

/**
 * What each operation answers. The schema map below is checked against this,
 * so the two cannot drift, and keying both by operation is what lets
 * `parseJobQueueRpcResult` return the operation's own type — callers no longer
 * re-assert it at the transport boundary.
 */
export interface JobQueueRpcResults {
  enqueue: string;
  dequeue: JobInfo | null;
  getStatus: JobInfo | null;
  getStatusByEntityId: JobInfo | null;
  startWorkerSession: undefined;
  heartbeatWorkerSession: boolean;
  endWorkerSession: boolean;
  renewAttemptLease: boolean;
  recordAttemptProgress: boolean;
  complete: boolean;
  update: boolean;
  fail: boolean;
  getStats: z.output<typeof statsSchema>;
  getDiagnostics: z.output<typeof diagnosticsSchema>;
  getRuntimeUpdates: JobRuntimeUpdate[];
  cleanup: number;
  getActiveJobs: JobInfo[];
  getFailedJobs: JobInfo[];
}

export type JobQueueRpcOperation = keyof JobQueueRpcResults;

const resultSchemas: {
  [Op in JobQueueRpcOperation]: z.ZodType<JobQueueRpcResults[Op], unknown>;
} = {
  enqueue: z.string().min(1),
  dequeue: nullableJobInfoSchema,
  getStatus: nullableJobInfoSchema,
  getStatusByEntityId: nullableJobInfoSchema,
  startWorkerSession: z.undefined(),
  heartbeatWorkerSession: booleanResultSchema,
  endWorkerSession: booleanResultSchema,
  renewAttemptLease: booleanResultSchema,
  recordAttemptProgress: booleanResultSchema,
  complete: booleanResultSchema,
  update: booleanResultSchema,
  fail: booleanResultSchema,
  getStats: statsSchema,
  getDiagnostics: diagnosticsSchema,
  getRuntimeUpdates: runtimeUpdatesSchema,
  cleanup: z.number().int().nonnegative(),
  getActiveJobs: jobInfoListSchema,
  getFailedJobs: jobInfoListSchema,
};

export function parseJobQueueRpcResult<Op extends JobQueueRpcOperation>(
  request: { operation: Op },
  input: unknown,
): JobQueueRpcResults[Op] {
  return resultSchemas[request.operation].parse(input);
}
