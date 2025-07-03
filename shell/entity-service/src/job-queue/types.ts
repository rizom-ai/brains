import type {
  JobQueue,
  JobOptions,
  JobType,
  JobDataFor,
  JobResultFor,
} from "@brains/db";

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
 * Job result after processing
 */
export interface JobResult<T extends JobType = JobType> {
  jobId: string;
  type: T;
  status: "completed" | "failed";
  result?: JobResultFor<T>;
  error?: string;
}

/**
 * Job queue service interface
 */
export interface IJobQueueService {
  /**
   * Register a job handler for a specific type
   */
  registerHandler<T extends JobType>(type: T, handler: JobHandler<T>): void;

  /**
   * Enqueue a job for processing
   */
  enqueue<T extends JobType>(
    type: T,
    data: JobDataFor<T>,
    options?: JobOptions,
  ): Promise<string>;

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
  complete<T extends JobType>(
    jobId: string,
    result?: JobResultFor<T>,
  ): Promise<void>;

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

/**
 * Legacy type aliases for backward compatibility during migration
 */
export type {
  EntityWithoutEmbedding,
  ContentGenerationRequest,
} from "@brains/db";
