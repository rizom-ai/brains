import type { JobQueue, JobOptions, JobType, JobDataFor } from "@brains/db";
import type { ProgressReporter } from "@brains/utils";

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
   * Get next job to process (marks as processing)
   */
  dequeue(): Promise<JobQueue | null>;

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
  getStatus(jobId: string): Promise<JobQueue | null>;

  /**
   * Get job status by entity ID (for embedding jobs)
   */
  getStatusByEntityId(entityId: string): Promise<JobQueue | null>;

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
  getActiveJobs(types?: string[]): Promise<JobQueue[]>;

  /**
   * Get registered job types
   */
  getRegisteredTypes(): string[];
}

/**
 * Type-safe job enqueue function
 */
export type EnqueueJob = <T extends JobType>(
  type: T,
  data: JobDataFor<T>,
  options: JobOptions,
) => Promise<string>;
