import { JobContextSchema } from "./schema/types";
import type {
  JobOptions,
  JobContext,
  ProjectionJobContext,
} from "./schema/types";
import type { BatchOperation, BatchJobStatus, Batch } from "./batch-schemas";
import type { DbConfig } from "@brains/contracts";
import type {
  ProgressNotification,
  ProgressReporter,
} from "@brains/utils/progress";
import { z } from "@brains/utils/zod";

// Re-export types that are used internally
export type { JobOptions, JobContext, ProjectionJobContext, BatchOperation };

/**
 * Request for enqueueing a job in the core job queue service.
 */
export interface JobQueueEnqueueRequest {
  /** Job type to enqueue */
  type: string;
  /** Job payload passed to the registered handler */
  data: unknown;
  /** Optional queue behavior, routing metadata, and retry settings */
  options?: JobOptions;
}

export interface JobInfo {
  id: string;
  type: string;
  data: string;
  status: "pending" | "processing" | "completed" | "failed";
  source: string | null;
  priority: number;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  createdAt: number;
  scheduledFor: number;
  startedAt: number | null;
  completedAt: number | null;
  attemptId: string | null;
  workerSlotId: string | null;
  workerSessionId: string | null;
  leaseExpiresAt: number | null;
  attemptHeartbeatAt: number | null;
  runtimeUpdatedAt: number | null;
  metadata: JobContext;
  progress: ProgressNotification | null;
  result?: unknown;
}

/** Ownership attached atomically when a worker dequeues a job. */
export interface JobClaimOptions {
  workerSlotId: string;
  workerSessionId: string;
  leaseDurationMs: number;
  workerSessionTimeoutMs: number;
}

/**
 * Simplified job info schema for external packages
 * Avoids exposing the complex Drizzle-inferred JobQueue type
 */
export const JobInfoSchema: z.ZodType<JobInfo, unknown> = z.object({
  id: z.string(),
  type: z.string(),
  data: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  source: z.string().nullable(),
  priority: z.number(),
  retryCount: z.number(),
  maxRetries: z.number(),
  lastError: z.string().nullable(),
  createdAt: z.number(),
  scheduledFor: z.number(),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
  attemptId: z.string().nullable(),
  workerSlotId: z.string().nullable(),
  workerSessionId: z.string().nullable(),
  leaseExpiresAt: z.number().nullable(),
  attemptHeartbeatAt: z.number().nullable(),
  runtimeUpdatedAt: z.number().nullable(),
  metadata: JobContextSchema,
  progress: z
    .custom<ProgressNotification>(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "progress" in value &&
        typeof value.progress === "number",
    )
    .nullable(),
  result: z.unknown().nullable().optional(), // Job result (type varies by job type)
});

export type JobHandlerRegistrationMode =
  "combined" | "validation-only" | "execution-only";

export interface JobValidator<TInput = unknown> {
  /** Validate and parse job data before durable enqueue. */
  validateAndParse(data: unknown): TInput | null;
}

/** Immutable declaration derived from a registered durable handler. */
export interface JobExecutionRegistration {
  readonly type: string;
  readonly pluginId: string | undefined;
}

/**
 * Job handler interface for processing specific job types
 *
 * @template TJobType - The job type string (can be any string for plugin extensibility)
 * @template TInput - The input data type for the job
 * @template TOutput - The output data type for the job
 */
export interface JobHandler<
  _TJobType extends string = string,
  TInput = unknown,
  TOutput = unknown,
> extends JobValidator<TInput> {
  /** Per-type execution deadline; falls back to the worker default. */
  readonly executionTimeoutMs?: number | undefined;

  /**
   * Process a job of this type
   * @param data - The job input data
   * @param jobId - Unique identifier for this job
   * @param progressReporter - Progress reporter for granular updates
   */
  process(
    data: TInput,
    jobId: string,
    progressReporter: ProgressReporter,
    signal: AbortSignal,
  ): Promise<TOutput>;

  /**
   * Handle job failure (optional)
   */
  onError?(
    error: Error,
    data: TInput,
    jobId: string,
    progressReporter: ProgressReporter,
    signal: AbortSignal,
  ): Promise<void>;

  /** Runs once after the queue exhausts retries and persists terminal failure. */
  onTerminalError?(
    error: Error,
    data: TInput,
    jobId: string,
    progressReporter: ProgressReporter,
    signal: AbortSignal,
  ): Promise<void>;
}

export interface JobQueueStats {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
  total: number;
}

export interface JobRuntimeUpdateCursor {
  readonly updatedAt: number;
  readonly jobId: string;
}

export interface JobRuntimeUpdate {
  readonly job: JobInfo;
  readonly cursor: JobRuntimeUpdateCursor;
}

export interface JobWorkerSessionDiagnostics {
  total: number;
  active: number;
  stale: number;
  latestHeartbeatAgeMs: number | null;
}

export interface JobQueueDiagnostics {
  totals: Omit<JobQueueStats, "total">;
  byType: Array<{
    type: string;
    status: JobInfo["status"];
    count: number;
  }>;
  oldestPendingAgeMs: number | null;
  oldestProcessingAgeMs: number | null;
  staleLeaseCount: number;
  workerSessions: JobWorkerSessionDiagnostics;
}

/**
 * Job queue service interface
 */
export interface IJobQueueService {
  /** Settle database readiness work before runtime services start. */
  initialize?(): Promise<void>;

  /**
   * Register a job handler for a specific type
   */
  registerHandler(type: string, handler: JobHandler, pluginId?: string): void;

  /**
   * Unregister a job handler for a specific type
   */
  unregisterHandler(type: string): void;

  /**
   * Unregister all handlers for a specific plugin
   */
  unregisterPluginHandlers(pluginId: string): void;

  /**
   * Get a handler for a specific job type
   */
  getHandler(type: string): JobHandler | undefined;

  /** Freeze handler declarations before runtime services can admit work. */
  finalizeHandlerRegistrations(): readonly JobExecutionRegistration[];

  /** Read the immutable handler declarations derived during boot. */
  getExecutionRegistrations(): readonly JobExecutionRegistration[];

  /**
   * Enqueue a job for processing
   */
  enqueue(request: JobQueueEnqueueRequest): Promise<string>;

  /** Dequeue and attach explicit attempt ownership. */
  dequeue(claim?: JobClaimOptions): Promise<JobInfo | null>;

  /** Register or supersede the live session for a stable worker slot. */
  startWorkerSession(
    workerSlotId: string,
    workerSessionId: string,
  ): Promise<void>;

  /** Persist worker liveness only while the session still owns its slot. */
  heartbeatWorkerSession(
    workerSlotId: string,
    workerSessionId: string,
  ): Promise<boolean>;

  /** Remove a normally stopped worker session. */
  endWorkerSession(
    workerSlotId: string,
    workerSessionId: string,
  ): Promise<boolean>;

  /** Renew a processing attempt's fenced lease. */
  renewAttemptLease(
    jobId: string,
    attemptId: string,
    leaseDurationMs: number,
  ): Promise<boolean>;

  /** Fence and persist a progress snapshot without extending the lease. */
  recordAttemptProgress(
    jobId: string,
    attemptId: string,
    progress: ProgressNotification,
  ): Promise<boolean>;

  /** Mark job as completed, fenced when an attempt token is supplied. */
  complete(
    jobId: string,
    result: unknown,
    attemptId?: string,
  ): Promise<boolean>;

  /** Mark job as failed, fenced when an attempt token is supplied. */
  fail(jobId: string, error: Error, attemptId?: string): Promise<boolean>;

  /** Update job data, fenced when an attempt token is supplied. */
  update(jobId: string, data: unknown, attemptId?: string): Promise<boolean>;

  /**
   * Get job status by job ID
   */
  getStatus(jobId: string): Promise<JobInfo | null>;

  /**
   * Get job status by entity ID (for embedding jobs)
   */
  getStatusByEntityId(entityId: string): Promise<JobInfo | null>;

  /**
   * Get queue statistics
   */
  getStats(): Promise<JobQueueStats>;

  /** Get bounded operational diagnostics without loading queue rows. */
  getDiagnostics(now?: number): Promise<JobQueueDiagnostics>;

  /** Read durable processing and terminal updates for web-owned publication. */
  getRuntimeUpdates(
    cursor: JobRuntimeUpdateCursor,
    limit?: number,
  ): Promise<JobRuntimeUpdate[]>;

  /**
   * Clean up old completed jobs
   */
  cleanup(olderThanMs: number): Promise<number>;

  /**
   * Get active jobs (pending or processing)
   */
  getActiveJobs(types?: string[]): Promise<JobInfo[]>;

  /**
   * Get failed jobs
   */
  getFailedJobs(types?: string[]): Promise<JobInfo[]>;

  /**
   * Get registered job types
   */
  getRegisteredTypes(): string[];

  /**
   * Close the underlying database connection.
   */
  close(): void;
}

/**
 * Job enqueue function
 */
export type EnqueueJob = (request: JobQueueEnqueueRequest) => Promise<string>;

/**
 * Database configuration for job queue
 */
export type { DbConfig as JobQueueDbConfig } from "@brains/contracts";

/**
 * Configuration for the JobQueueService.
 */
export type JobQueueServiceConfig = DbConfig & {
  /**
   * Legacy fallback lease/session duration for direct dequeue() callers.
   * Worker-owned claims pass explicit lease and liveness settings.
   */
  claimTimeoutMs?: number;
};

export const DEFAULT_WORKER_SESSION_TIMEOUT_MS = 15_000;

/**
 * Configuration for the JobQueueWorker
 */
export interface JobQueueWorkerConfig {
  /** Number of concurrent jobs to process */
  concurrency?: number;
  /** Polling interval in milliseconds */
  pollInterval?: number;
  /** Maximum number of jobs to process before stopping (0 for unlimited) */
  maxJobs?: number;
  /** Whether to start the worker automatically */
  autoStart?: boolean;
  /** Stable identity for this worker process across restarts. */
  workerSlotId?: string;
  /** Default deadline when a handler has no per-type override. */
  defaultExecutionTimeoutMs?: number;
  /** Time allowed for a handler to settle after cancellation. */
  cancellationGraceMs?: number;
  /** Deadline for an optional handler failure callback. */
  errorCallbackTimeoutMs?: number;
  /** Duration granted by each attempt lease renewal. */
  leaseDurationMs?: number;
  /** Attempt lease renewal cadence. */
  attemptHeartbeatIntervalMs?: number;
  /** Worker-session heartbeat cadence. */
  workerHeartbeatIntervalMs?: number;
  /** Liveness timeout used to reclaim another worker's attempts. */
  workerSessionTimeoutMs?: number;
  /** Called once when this process can no longer safely execute queue work. */
  onUnhealthy?: (reason: string) => void;
}

/**
 * Statistics for the JobQueueWorker
 */
export interface JobQueueWorkerStats {
  /** Number of jobs processed successfully */
  processedJobs: number;
  /** Number of jobs that failed */
  failedJobs: number;
  /** Number of jobs currently being processed */
  activeJobs: number;
  /** Worker uptime in milliseconds */
  uptime: number;
  /** Whether the worker is currently running */
  isRunning: boolean;
  /** Whether this process can safely claim additional work. */
  isHealthy: boolean;
  /** Why the worker stopped accepting work. */
  unhealthyReason?: string;
  /** Last error encountered */
  lastError?: string;
}

/**
 * Interface for job queue worker
 */
export interface IJobQueueWorker {
  /** Start the worker */
  start(): Promise<void>;
  /** Stop the worker */
  stop(): Promise<void>;
  /** Get worker statistics */
  getStats(): JobQueueWorkerStats;
  /** Check if worker is running */
  isWorkerRunning(): boolean;
}

/**
 * Interface for batch job manager
 */
export interface IBatchJobManager {
  /** Start periodic cleanup of terminal batch metadata. Idempotent. */
  start(intervalMs?: number): void | Promise<void>;

  /** Stop periodic cleanup and drain in-flight metadata cleanup. */
  stop(): void | Promise<void>;

  /** Register a batch for tracking */
  registerBatch(
    batchId: string,
    jobIds: string[],
    operations: BatchOperation[],
    source: string,
    metadata: JobContext,
  ): void;

  /** Enqueue a batch of operations */
  enqueueBatch(
    operations: BatchOperation[],
    options: JobOptions,
    batchId: string,
    source: string,
  ): Promise<string>;

  /** Get status of a specific batch */
  getBatchStatus(batchId: string): Promise<BatchJobStatus | null>;

  /** Get all active batches */
  getActiveBatches(): Promise<Batch[]>;
}

/**
 * Unified jobs namespace interface
 * Combines job queue and batch operations for shell/context usage
 */
export interface IJobsNamespace {
  // === Job Monitoring ===

  /** Get active jobs, optionally filtered by type */
  getActiveJobs(types?: string[]): Promise<JobInfo[]>;

  /** Get status of a specific job */
  getStatus(jobId: string): Promise<JobInfo | null>;

  // === Batch Operations ===

  /** Enqueue multiple operations as a batch */
  enqueueBatch(
    operations: BatchOperation[],
    options: JobOptions,
    batchId: string,
    pluginId: string,
  ): Promise<string>;

  /** Get all active batches */
  getActiveBatches(): Promise<Batch[]>;

  /** Get status of a specific batch */
  getBatchStatus(batchId: string): Promise<BatchJobStatus | null>;
}
