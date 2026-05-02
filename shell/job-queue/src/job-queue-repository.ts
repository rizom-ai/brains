import { and, asc, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { jobQueue } from "./schema/job-queue";
import type { InsertJobQueue, JobQueue } from "./schema/job-queue";
import type { Logger } from "@brains/utils";
import { JOB_STATUS } from "./schemas";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { JobInfo } from "./types";

export interface JobQueueStats {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
  total: number;
}

/**
 * Database-backed job queue operations.
 * Keeps persistence details out of JobQueueService orchestration logic.
 */
export class JobQueueRepository {
  private logger: Logger;

  constructor(
    private db: LibSQLDatabase<Record<string, unknown>>,
    logger: Logger,
  ) {
    this.logger = logger.child("JobQueueRepository");
  }

  public async insert(jobData: InsertJobQueue): Promise<void> {
    await this.db.insert(jobQueue).values(jobData);
  }

  public async markFailedAsReplaced(jobId: string): Promise<void> {
    await this.db
      .update(jobQueue)
      .set({
        status: JOB_STATUS.FAILED,
        lastError: "Replaced by newer job",
      })
      .where(eq(jobQueue.id, jobId));
  }

  public async rescheduleForImmediateRun(jobId: string): Promise<void> {
    await this.db
      .update(jobQueue)
      .set({ scheduledFor: Date.now() })
      .where(eq(jobQueue.id, jobId));
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
        lastError: null,
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

  public async getStatus(jobId: string): Promise<JobInfo | null> {
    const jobs = await this.db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.id, jobId))
      .limit(1);

    return jobs[0] ?? null;
  }

  public async getStatusByEntityId(entityId: string): Promise<JobInfo | null> {
    const jobs = await this.db
      .select()
      .from(jobQueue)
      .where(sql`json_extract(${jobQueue.data}, '$.id') = ${entityId}`)
      .orderBy(desc(jobQueue.createdAt))
      .limit(1);

    return jobs[0] ?? null;
  }

  public async getStats(): Promise<JobQueueStats> {
    const stats = await this.db
      .select({
        status: jobQueue.status,
        count: sql<number>`count(*)`,
      })
      .from(jobQueue)
      .groupBy(jobQueue.status);

    const result: JobQueueStats = {
      pending: 0,
      processing: 0,
      failed: 0,
      completed: 0,
      total: 0,
    };

    for (const row of stats) {
      const count = Number(row.count);
      result[row.status] = count;
      result.total += count;
    }

    return result;
  }

  public async cleanup(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;

    const result = await this.db
      .delete(jobQueue)
      .where(
        and(
          or(
            eq(jobQueue.status, JOB_STATUS.COMPLETED),
            eq(jobQueue.status, JOB_STATUS.FAILED),
          ),
          lte(jobQueue.completedAt, cutoff),
        ),
      );

    return result.rowsAffected;
  }

  public async getActiveJobs(types?: string[]): Promise<JobInfo[]> {
    const activeStatusFilter = or(
      eq(jobQueue.status, JOB_STATUS.PENDING),
      eq(jobQueue.status, JOB_STATUS.PROCESSING),
    );

    const whereClause =
      types && types.length > 0
        ? and(activeStatusFilter, inArray(jobQueue.type, types))
        : activeStatusFilter;

    return this.db
      .select()
      .from(jobQueue)
      .where(whereClause)
      .orderBy(desc(jobQueue.createdAt));
  }

  public async findReadyCandidates(
    now: number,
    limit: number,
  ): Promise<JobQueue[]> {
    return this.db
      .select()
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.status, JOB_STATUS.PENDING),
          lte(jobQueue.scheduledFor, now),
        ),
      )
      .orderBy(asc(jobQueue.priority), asc(jobQueue.createdAt))
      .limit(limit);
  }

  /**
   * Mark a job as processing
   */
  public async claimPending(jobId: string, now = Date.now()): Promise<boolean> {
    const result = await this.db
      .update(jobQueue)
      .set({
        status: JOB_STATUS.PROCESSING,
        startedAt: now,
      })
      .where(
        and(
          eq(jobQueue.id, jobId),
          eq(jobQueue.status, JOB_STATUS.PENDING),
          lte(jobQueue.scheduledFor, now),
        ),
      );

    const claimed = result.rowsAffected > 0;
    if (claimed) {
      this.logger.debug("Job marked as processing", { jobId });
    }

    return claimed;
  }
}
