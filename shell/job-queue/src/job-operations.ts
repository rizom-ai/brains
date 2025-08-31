import { eq, and } from "drizzle-orm";
import { jobQueue } from "./schema/job-queue";
import type { Logger } from "@brains/utils";
import { JOB_STATUS } from "./schemas";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

/**
 * Job lifecycle operations
 * Extracted from JobQueueService for single responsibility
 */
export class JobOperations {
  private logger: Logger;

  constructor(
    private db: LibSQLDatabase<Record<string, unknown>>,
    logger: Logger,
  ) {
    this.logger = logger.child("JobOperations");
  }

  /**
   * Mark a job as completed
   */
  public async complete(jobId: string, result: unknown): Promise<void> {
    const now = Date.now();

    await this.db
      .update(jobQueue)
      .set({
        status: JOB_STATUS.COMPLETED,
        result: JSON.stringify(result),
        completedAt: now,
      })
      .where(eq(jobQueue.id, jobId));

    this.logger.debug("Job completed", {
      jobId,
      hasResult: result !== undefined,
    });
  }

  /**
   * Update job data (for progress tracking)
   */
  public async update(jobId: string, data: unknown): Promise<void> {
    await this.db
      .update(jobQueue)
      .set({
        data: JSON.stringify(data),
      })
      .where(eq(jobQueue.id, jobId));

    this.logger.debug("Job data updated", { jobId });
  }

  /**
   * Mark a job as failed
   */
  public async fail(jobId: string, error: Error): Promise<void> {
    const jobs = await this.db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.id, jobId))
      .limit(1);

    const job = jobs[0];
    if (!job) {
      this.logger.warn("Job not found for failure update", { jobId });
      return;
    }

    const maxRetries = job.maxRetries;
    const retryCount = job.retryCount;
    const now = Date.now();

    if (retryCount < maxRetries) {
      // Schedule for retry with exponential backoff
      const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 60000);
      const scheduledFor = now + backoffMs;

      await this.db
        .update(jobQueue)
        .set({
          status: JOB_STATUS.PENDING,
          retryCount: retryCount + 1,
          lastError: error.message,
          scheduledFor,
        })
        .where(eq(jobQueue.id, jobId));

      this.logger.debug("Job scheduled for retry", {
        jobId,
        retryCount: retryCount + 1,
        backoffMs,
        scheduledFor: new Date(scheduledFor).toISOString(),
      });
    } else {
      // Max retries exceeded, mark as failed
      await this.db
        .update(jobQueue)
        .set({
          status: JOB_STATUS.FAILED,
          lastError: error.message,
          completedAt: now,
        })
        .where(eq(jobQueue.id, jobId));

      this.logger.error("Job failed after max retries", {
        jobId,
        type: job.type,
        retryCount,
        error: error.message,
      });
    }
  }

  /**
   * Mark a job as processing
   */
  public async markProcessing(jobId: string): Promise<void> {
    const now = Date.now();
    await this.db
      .update(jobQueue)
      .set({
        status: JOB_STATUS.PROCESSING,
        startedAt: now,
      })
      .where(eq(jobQueue.id, jobId));

    this.logger.debug("Job marked as processing", { jobId });
  }

  /**
   * Reset a stuck job back to pending
   */
  public async resetStuckJob(jobId: string): Promise<void> {
    await this.db
      .update(jobQueue)
      .set({
        status: JOB_STATUS.PENDING,
        startedAt: null,
      })
      .where(
        and(eq(jobQueue.id, jobId), eq(jobQueue.status, JOB_STATUS.PROCESSING)),
      );

    this.logger.debug("Reset stuck job to pending", { jobId });
  }
}
