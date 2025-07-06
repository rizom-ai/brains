import type {
  JobQueue,
  JobOptions,
  JobType,
  JobDataFor,
  JobResultFor,
} from "@brains/db";
import type { JobResult } from "./schemas";

/**
 * Job handler interface for processing specific job types
 */
export interface JobHandler<
  TJobType extends JobType = JobType,
  TInput = JobDataFor<TJobType>,
  TOutput = JobResultFor<TJobType>,
> {
  /**
   * Process a job of this type
   */
  process(data: TInput, jobId: string): Promise<TOutput>;

  /**
   * Handle job failure (optional)
   */
  onError?(error: Error, data: TInput, jobId: string): Promise<void>;

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
  registerHandler(type: string, handler: JobHandler): void;

  /**
   * Enqueue a job for processing
   */
  enqueue(type: string, data: unknown, options?: JobOptions): Promise<string>;

  /**
   * Get next job to process (marks as processing)
   */
  dequeue(): Promise<JobQueue | null>;

  /**
   * Process a job using its registered handler
   */
  processJob(job: JobQueue): Promise<JobResult>;

  /**
   * Mark job as completed
   */
  complete(jobId: string, result: unknown): Promise<void>;

  /**
   * Mark job as failed and handle retry
   */
  fail(jobId: string, error: Error): Promise<void>;

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
  options?: JobOptions,
) => Promise<string>;
