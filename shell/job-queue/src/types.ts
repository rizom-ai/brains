import { JobContextSchema } from "./schema/types";
import type { JobOptions, JobContext } from "./schema/types";
import type { BatchOperation, BatchJobStatus, Batch } from "./batch-schemas";

// Re-export types that are used internally
export type { JobOptions, JobContext };
import type { ProgressReporter } from "@brains/utils";
import { z } from "@brains/utils";

/**
 * Simplified job info schema for external packages
 * Avoids exposing the complex Drizzle-inferred JobQueue type
 */
export const JobInfoSchema = z.object({
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
  metadata: JobContextSchema,
});

export type JobInfo = z.infer<typeof JobInfoSchema>;

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
> {
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
  ): Promise<TOutput>;

  /**
   * Handle job failure (optional)
   */
  onError?(
    error: Error,
    data: TInput,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<void>;

  /**
   * Validate and parse job data
   * Returns parsed data if valid, null if invalid
   */
  validateAndParse(data: unknown): TInput | null;
}

/**
 * Job queue service interface
 */
export interface IJobQueueService {
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

  /**
   * Enqueue a job for processing
   */
  enqueue(
    type: string,
    data: unknown,
    options: JobOptions,
    pluginId?: string,
  ): Promise<string>;

  /**
   * Mark job as completed
   */
  complete(jobId: string, result: unknown): Promise<void>;

  /**
   * Mark job as failed and handle retry
   */
  fail(jobId: string, error: Error): Promise<void>;

  /**
   * Update job data
   */
  update(jobId: string, data: unknown): Promise<void>;

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
  getStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    total: number;
  }>;

  /**
   * Clean up old completed jobs
   */
  cleanup(olderThanMs: number): Promise<number>;

  /**
   * Get active jobs (pending or processing)
   */
  getActiveJobs(types?: string[]): Promise<JobInfo[]>;

  /**
   * Get registered job types
   */
  getRegisteredTypes(): string[];
}

/**
 * Job enqueue function
 */
export type EnqueueJob = (
  type: string,
  data: unknown,
  options: JobOptions,
) => Promise<string>;

/**
 * Database configuration for job queue
 */
export interface JobQueueDbConfig {
  url: string; // Now required - no default
  authToken?: string;
}

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
