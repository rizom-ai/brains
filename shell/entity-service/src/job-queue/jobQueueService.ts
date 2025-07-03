import type { DrizzleDB } from "@brains/db";
import {
  jobQueue,
  eq,
  and,
  sql,
  desc,
  asc,
  lte,
  createId,
  type JobOptions,
  type JobQueue,
  type JobType,
  type JobDataFor,
  type JobResultFor,
} from "@brains/db";
import { Logger } from "@brains/utils";
import type { IJobQueueService, JobHandler, JobResult } from "./types";

/**
 * Service for managing the generic job queue
 * Implements Component Interface Standardization pattern
 */
export class JobQueueService implements IJobQueueService {
  private static instance: JobQueueService | null = null;
  private db: DrizzleDB;
  private logger: Logger;
  private handlers: Map<string, JobHandler> = new Map();

  /**
   * Get the singleton instance
   */
  public static getInstance(db: DrizzleDB, logger?: Logger): JobQueueService {
    JobQueueService.instance ??= new JobQueueService(
      db,
      logger ?? Logger.getInstance(),
    );
    return JobQueueService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    JobQueueService.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(db: DrizzleDB, logger?: Logger): JobQueueService {
    return new JobQueueService(db, logger ?? Logger.getInstance());
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(db: DrizzleDB, logger: Logger) {
    this.db = db;
    this.logger = logger.child("JobQueueService");
  }

  /**
   * Register a job handler for a specific type
   */
  public registerHandler<T extends JobType>(
    type: T,
    handler: JobHandler<T>,
  ): void {
    this.handlers.set(type, handler as JobHandler);
    this.logger.debug("Registered job handler", { type });
  }

  /**
   * Enqueue a job for processing
   */
  public async enqueue<T extends JobType>(
    type: T,
    data: JobDataFor<T>,
    options: JobOptions = {},
  ): Promise<string> {
    const jobId = createId();

    try {
      // Get handler and validate data
      const handler = this.handlers.get(type);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${type}`);
      }

      // Always validate and parse data
      const parsedData = handler.validateAndParse(data);
      if (parsedData === null) {
        throw new Error(`Invalid job data for type: ${type}`);
      }

      // Use the parsed data for the job
      data = parsedData;

      await this.db.insert(jobQueue).values({
        id: jobId,
        type,
        data,
        priority: options.priority ?? 0,
        maxRetries: options.maxRetries ?? 3,
        scheduledFor: Date.now() + (options.delayMs ?? 0),
      });

      this.logger.debug("Enqueued job", {
        jobId,
        type,
        priority: options.priority,
      });

      return jobId;
    } catch (error) {
      this.logger.error("Failed to enqueue job", {
        type,
        error,
      });
      throw error;
    }
  }

  /**
   * Get next job to process (marks as processing)
   */
  public async dequeue(): Promise<JobQueue | null> {
    const now = Date.now();

    try {
      // Get the next pending job with highest priority, earliest scheduled time
      const jobs = await this.db
        .select()
        .from(jobQueue)
        .where(
          and(eq(jobQueue.status, "pending"), lte(jobQueue.scheduledFor, now)),
        )
        .orderBy(desc(jobQueue.priority), asc(jobQueue.scheduledFor))
        .limit(1);

      if (jobs.length === 0) {
        return null;
      }

      const job = jobs[0];
      if (!job) {
        return null;
      }

      // Mark as processing
      await this.db
        .update(jobQueue)
        .set({
          status: "processing",
          startedAt: now,
        })
        .where(eq(jobQueue.id, job.id));

      this.logger.debug("Dequeued job", {
        jobId: job.id,
        type: job.type,
      });

      return { ...job, status: "processing", startedAt: now };
    } catch (error) {
      this.logger.error("Failed to dequeue job", { error });
      throw error;
    }
  }

  /**
   * Process a job using its registered handler
   */
  public async processJob(job: JobQueue): Promise<JobResult> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      const error = new Error(
        `No handler registered for job type: ${job.type}`,
      );
      await this.fail(job.id, error);
      return {
        jobId: job.id,
        type: job.type as JobType,
        status: "failed",
        error: error.message,
      };
    }

    try {
      this.logger.debug("Processing job", {
        jobId: job.id,
        type: job.type,
      });

      // Validate and parse job data before processing
      const parsedData = handler.validateAndParse(job.data);
      if (parsedData === null) {
        throw new Error(`Invalid job data for type: ${job.type}`);
      }

      const result = await handler.process(parsedData, job.id);
      await this.complete(job.id, result);

      return {
        jobId: job.id,
        type: job.type as JobType,
        status: "completed",
        result,
      };
    } catch (error) {
      const processError =
        error instanceof Error ? error : new Error(String(error));

      // Call handler's error callback if available
      try {
        // Validate and parse job data for error handler
        const parsedData = handler.validateAndParse(job.data);
        if (parsedData !== null) {
          await handler.onError?.(processError, parsedData, job.id);
        }
      } catch (callbackError) {
        this.logger.error("Job handler error callback failed", {
          jobId: job.id,
          error: callbackError,
        });
      }

      await this.fail(job.id, processError);

      return {
        jobId: job.id,
        type: job.type as JobType,
        status: "failed",
        error: processError.message,
      };
    }
  }

  /**
   * Mark job as completed
   */
  public async complete<T extends JobType>(
    jobId: string,
    result?: JobResultFor<T>,
  ): Promise<void> {
    try {
      await this.db
        .update(jobQueue)
        .set({
          status: "completed",
          completedAt: Date.now(),
          result: result as unknown,
        })
        .where(eq(jobQueue.id, jobId));

      this.logger.debug("Completed job", { jobId });
    } catch (error) {
      this.logger.error("Failed to mark job as completed", {
        jobId,
        error,
      });
      throw error;
    }
  }

  /**
   * Mark job as failed and handle retry
   */
  public async fail(jobId: string, error: Error): Promise<void> {
    try {
      const jobs = await this.db
        .select()
        .from(jobQueue)
        .where(eq(jobQueue.id, jobId))
        .limit(1);

      if (jobs.length === 0) {
        this.logger.warn("Cannot fail job: job not found", { jobId });
        return;
      }

      const job = jobs[0];
      if (!job) {
        return;
      }

      const newRetryCount = job.retryCount + 1;
      const shouldRetry = newRetryCount < job.maxRetries;

      if (shouldRetry) {
        // Retry with exponential backoff
        const delayMs = Math.min(1000 * Math.pow(2, newRetryCount), 60000);
        await this.db
          .update(jobQueue)
          .set({
            status: "pending",
            retryCount: newRetryCount,
            lastError: error.message,
            scheduledFor: Date.now() + delayMs,
            startedAt: null,
          })
          .where(eq(jobQueue.id, jobId));

        this.logger.debug("Retrying job", {
          jobId,
          attempt: newRetryCount,
          delayMs,
        });
      } else {
        // Max retries exceeded
        await this.db
          .update(jobQueue)
          .set({
            status: "failed",
            retryCount: newRetryCount,
            lastError: error.message,
            completedAt: Date.now(),
          })
          .where(eq(jobQueue.id, jobId));

        this.logger.error("Job failed permanently", {
          jobId,
          error: error.message,
          attempts: newRetryCount,
        });
      }
    } catch (dbError) {
      this.logger.error("Failed to update job failure", {
        jobId,
        error: dbError,
      });
      throw dbError;
    }
  }

  /**
   * Get job status by job ID
   */
  public async getStatus(jobId: string): Promise<JobQueue | null> {
    try {
      const jobs = await this.db
        .select()
        .from(jobQueue)
        .where(eq(jobQueue.id, jobId))
        .limit(1);

      return jobs[0] ?? null;
    } catch (error) {
      this.logger.error("Failed to get job status", { jobId, error });
      throw error;
    }
  }

  /**
   * Get job status by entity ID (for embedding jobs)
   */
  public async getStatusByEntityId(entityId: string): Promise<JobQueue | null> {
    try {
      const jobs = await this.db
        .select()
        .from(jobQueue)
        .where(
          and(
            eq(jobQueue.type, "embedding"),
            sql`json_extract(${jobQueue.data}, '$.id') = ${entityId}`,
          ),
        )
        .orderBy(desc(jobQueue.createdAt))
        .limit(1);

      return jobs[0] ?? null;
    } catch (error) {
      this.logger.error("Failed to get job status by entity ID", {
        entityId,
        error,
      });
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  public async getStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    total: number;
  }> {
    try {
      const results = await this.db
        .select({
          status: jobQueue.status,
          count: sql<number>`count(*)`.as("count"),
        })
        .from(jobQueue)
        .groupBy(jobQueue.status);

      const stats = {
        pending: 0,
        processing: 0,
        failed: 0,
        completed: 0,
        total: 0,
      };

      for (const result of results) {
        const count = Number(result.count);
        stats[result.status as keyof typeof stats] = count;
        stats.total += count;
      }

      return stats;
    } catch (error) {
      this.logger.error("Failed to get queue statistics", { error });
      throw error;
    }
  }

  /**
   * Clean up old completed jobs
   */
  public async cleanup(olderThanMs: number): Promise<number> {
    const cutoffTime = Date.now() - olderThanMs;

    try {
      const result = await this.db
        .delete(jobQueue)
        .where(
          and(
            eq(jobQueue.status, "completed"),
            lte(jobQueue.completedAt, cutoffTime),
          ),
        );

      const deletedCount = result.rowsAffected;
      this.logger.debug("Cleaned up old jobs", {
        deletedCount,
        olderThanMs,
      });

      return deletedCount;
    } catch (error) {
      this.logger.error("Failed to cleanup old jobs", { error });
      throw error;
    }
  }

  /**
   * Get registered job types
   */
  public getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
