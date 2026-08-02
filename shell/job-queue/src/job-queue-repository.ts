import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  lte,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { jobQueue, jobWorkerSessions } from "./schema/job-queue";
import type { InsertJobQueue, JobQueue } from "./schema/job-queue";
import type { Logger } from "@brains/utils/logger";
import { JOB_STATUS } from "./schemas";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { JobInfo, JobQueueDiagnostics, JobQueueStats } from "./types";

export interface JobAttemptClaim {
  now: number;
  attemptId: string;
  workerSlotId: string;
  workerSessionId: string;
  leaseDurationMs: number;
  workerSessionTimeoutMs: number;
}

/**
 * Database-backed job queue operations.
 * Keeps persistence details out of JobQueueService orchestration logic.
 */
export class JobQueueRepository {
  private db: LibSQLDatabase<Record<string, unknown>>;
  private logger: Logger;

  constructor(db: LibSQLDatabase<Record<string, unknown>>, logger: Logger) {
    this.db = db;
    this.logger = logger.child("JobQueueRepository");
  }

  public async insert(jobData: InsertJobQueue): Promise<void> {
    await this.db.insert(jobQueue).values(jobData);
  }

  /** Atomically register a new session, superseding the slot's prior session. */
  public async startWorkerSession(
    workerSlotId: string,
    workerSessionId: string,
    now: number = Date.now(),
  ): Promise<void> {
    await this.db
      .insert(jobWorkerSessions)
      .values({
        slotId: workerSlotId,
        sessionId: workerSessionId,
        startedAt: now,
        heartbeatAt: now,
      })
      .onConflictDoUpdate({
        target: jobWorkerSessions.slotId,
        set: {
          sessionId: workerSessionId,
          startedAt: now,
          heartbeatAt: now,
        },
      });
  }

  /** Update liveness only if this session still owns the stable slot. */
  public async heartbeatWorkerSession(
    workerSlotId: string,
    workerSessionId: string,
    now: number = Date.now(),
  ): Promise<boolean> {
    const result = await this.db
      .update(jobWorkerSessions)
      .set({ heartbeatAt: now })
      .where(
        and(
          eq(jobWorkerSessions.slotId, workerSlotId),
          eq(jobWorkerSessions.sessionId, workerSessionId),
        ),
      )
      .returning({ slotId: jobWorkerSessions.slotId });
    return result.length === 1;
  }

  /** Remove a normally stopped session without touching a replacement. */
  public async endWorkerSession(
    workerSlotId: string,
    workerSessionId: string,
  ): Promise<boolean> {
    const result = await this.db
      .delete(jobWorkerSessions)
      .where(
        and(
          eq(jobWorkerSessions.slotId, workerSlotId),
          eq(jobWorkerSessions.sessionId, workerSessionId),
        ),
      )
      .returning({ slotId: jobWorkerSessions.slotId });
    return result.length === 1;
  }

  /**
   * Mark a job as terminally failed (no retry). Use `fail()` for the normal
   * retry-aware failure path; this primitive exists for callers (like the
   * dedup-replace strategy) that need to abort a pending job outright.
   */
  public async markTerminallyFailed(
    jobId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.db
      .update(jobQueue)
      .set({
        status: JOB_STATUS.FAILED,
        lastError: errorMessage,
        completedAt: Date.now(),
      })
      .where(
        and(eq(jobQueue.id, jobId), eq(jobQueue.status, JOB_STATUS.PENDING)),
      );
  }

  public async setScheduledFor(
    jobId: string,
    scheduledFor: number,
  ): Promise<void> {
    await this.db
      .update(jobQueue)
      .set({ scheduledFor })
      .where(eq(jobQueue.id, jobId));
  }

  /** Mark a job completed only if the supplied attempt still owns it. */
  public async complete(
    jobId: string,
    result: unknown,
    attemptId?: string,
  ): Promise<boolean> {
    const now = Date.now();
    const updated = await this.db
      .update(jobQueue)
      .set({
        status: JOB_STATUS.COMPLETED,
        result,
        lastError: null,
        completedAt: now,
      })
      .where(this.attemptWriteGuard(jobId, attemptId))
      .returning({ id: jobQueue.id });

    const applied = updated.length === 1;
    if (applied) {
      this.logger.debug("Job completed", {
        jobId,
        hasResult: result !== undefined,
      });
    }
    return applied;
  }

  /** Update job data only if the supplied attempt still owns it. */
  public async update(
    jobId: string,
    data: unknown,
    attemptId?: string,
  ): Promise<boolean> {
    const updated = await this.db
      .update(jobQueue)
      .set({ data: JSON.stringify(data) })
      .where(this.attemptWriteGuard(jobId, attemptId))
      .returning({ id: jobQueue.id });

    const applied = updated.length === 1;
    if (applied) this.logger.debug("Job data updated", { jobId });
    return applied;
  }

  /** Record progress only while the attempt token remains current. */
  public async recordAttemptProgress(
    jobId: string,
    attemptId: string,
    now: number = Date.now(),
  ): Promise<boolean> {
    const updated = await this.db
      .update(jobQueue)
      .set({ attemptHeartbeatAt: now })
      .where(this.attemptWriteGuard(jobId, attemptId))
      .returning({ id: jobQueue.id });
    return updated.length === 1;
  }

  /** Renew the attempt heartbeat and lease under the fencing token. */
  public async renewAttemptLease(
    jobId: string,
    attemptId: string,
    now: number,
    leaseDurationMs: number,
  ): Promise<boolean> {
    const updated = await this.db
      .update(jobQueue)
      .set({
        attemptHeartbeatAt: now,
        leaseExpiresAt: now + leaseDurationMs,
      })
      .where(this.attemptWriteGuard(jobId, attemptId))
      .returning({ id: jobQueue.id });
    return updated.length === 1;
  }

  /** Mark a current attempt failed and apply bounded retry policy. */
  public async fail(
    jobId: string,
    error: Error,
    attemptId?: string,
    now: number = Date.now(),
  ): Promise<boolean> {
    const current = await this.db
      .select({
        retryCount: jobQueue.retryCount,
        maxRetries: jobQueue.maxRetries,
        type: jobQueue.type,
        scheduledFor: jobQueue.scheduledFor,
        startedAt: jobQueue.startedAt,
      })
      .from(jobQueue)
      .where(this.attemptWriteGuard(jobId, attemptId))
      .limit(1);
    const job = current[0];
    if (!job) return false;

    const canRetry = job.retryCount < job.maxRetries;
    const nextRetryCount = canRetry ? job.retryCount + 1 : job.retryCount;
    const backoffMs = Math.min(1000 * 2 ** job.retryCount, 60_000);
    const scheduledFor = canRetry ? now + backoffMs : job.scheduledFor;
    const updated = await this.db
      .update(jobQueue)
      .set({
        status: canRetry ? JOB_STATUS.PENDING : JOB_STATUS.FAILED,
        retryCount: nextRetryCount,
        lastError: error.message,
        scheduledFor,
        completedAt: canRetry ? null : now,
        startedAt: canRetry ? null : job.startedAt,
        attemptId: null,
        workerSlotId: null,
        workerSessionId: null,
        leaseExpiresAt: null,
        attemptHeartbeatAt: null,
      })
      .where(
        and(
          this.attemptWriteGuard(jobId, attemptId),
          eq(jobQueue.retryCount, job.retryCount),
        ),
      )
      .returning({ id: jobQueue.id });
    if (updated.length !== 1) return false;

    if (canRetry) {
      this.logger.debug("Job scheduled for retry", {
        jobId,
        retryCount: nextRetryCount,
        backoffMs,
        scheduledFor: new Date(scheduledFor).toISOString(),
      });
    } else {
      this.logger.error("Job failed after max retries", {
        jobId,
        type: job.type,
        retryCount: job.retryCount,
        error: error.message,
      });
    }
    return true;
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

  public async getDiagnostics(
    now: number = Date.now(),
  ): Promise<JobQueueDiagnostics> {
    const [byTypeRows, ageRows] = await Promise.all([
      this.db
        .select({
          type: jobQueue.type,
          status: jobQueue.status,
          count: sql<number>`count(*)`,
        })
        .from(jobQueue)
        .groupBy(jobQueue.type, jobQueue.status),
      this.db
        .select({
          oldestPendingAt: sql<
            number | null
          >`min(case when ${jobQueue.status} = ${JOB_STATUS.PENDING} then ${jobQueue.createdAt} end)`,
          oldestProcessingAt: sql<
            number | null
          >`min(case when ${jobQueue.status} = ${JOB_STATUS.PROCESSING} then ${jobQueue.startedAt} end)`,
          staleLeaseCount: sql<number>`coalesce(sum(case when ${jobQueue.status} = ${JOB_STATUS.PROCESSING} and ${jobQueue.leaseExpiresAt} is not null and ${jobQueue.leaseExpiresAt} <= ${now} then 1 else 0 end), 0)`,
        })
        .from(jobQueue),
    ]);

    const totals: JobQueueDiagnostics["totals"] = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };
    const byType = byTypeRows.map((row) => {
      const count = Number(row.count);
      totals[row.status] += count;
      return { type: row.type, status: row.status, count };
    });
    const ages = ageRows[0];
    const ageSince = (timestamp: number | null | undefined): number | null =>
      timestamp === null || timestamp === undefined
        ? null
        : Math.max(0, now - Number(timestamp));

    return {
      totals,
      byType,
      oldestPendingAgeMs: ageSince(ages?.oldestPendingAt),
      oldestProcessingAgeMs: ageSince(ages?.oldestProcessingAt),
      staleLeaseCount: Number(ages?.staleLeaseCount ?? 0),
    };
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

  public async getFailedJobs(types?: string[]): Promise<JobInfo[]> {
    const failedStatusFilter = eq(jobQueue.status, JOB_STATUS.FAILED);
    const whereClause =
      types && types.length > 0
        ? and(failedStatusFilter, inArray(jobQueue.type, types))
        : failedStatusFilter;

    return this.db
      .select()
      .from(jobQueue)
      .where(whereClause)
      .orderBy(desc(jobQueue.createdAt));
  }

  /**
   * Atomically claim the highest-priority pending or safely reclaimable job.
   * A superseded session is reclaimable immediately. Another slot's attempt
   * requires both an expired lease and an expired owner-session heartbeat.
   */
  public async claimNextReady(
    claim: JobAttemptClaim,
  ): Promise<JobQueue | null> {
    const {
      now,
      attemptId,
      workerSlotId,
      workerSessionId,
      leaseDurationMs,
      workerSessionTimeoutMs,
    } = claim;
    const sessionExpiredBefore = now - workerSessionTimeoutMs;

    const claimingSession = this.db
      .select({ slotId: jobWorkerSessions.slotId })
      .from(jobWorkerSessions)
      .where(
        and(
          eq(jobWorkerSessions.slotId, workerSlotId),
          eq(jobWorkerSessions.sessionId, workerSessionId),
        ),
      );
    const matchingOwnerSession = this.db
      .select({ slotId: jobWorkerSessions.slotId })
      .from(jobWorkerSessions)
      .where(
        and(
          eq(jobWorkerSessions.slotId, jobQueue.workerSlotId),
          eq(jobWorkerSessions.sessionId, jobQueue.workerSessionId),
        ),
      );
    const staleOwnerSession = this.db
      .select({ slotId: jobWorkerSessions.slotId })
      .from(jobWorkerSessions)
      .where(
        and(
          eq(jobWorkerSessions.slotId, jobQueue.workerSlotId),
          eq(jobWorkerSessions.sessionId, jobQueue.workerSessionId),
          lte(jobWorkerSessions.heartbeatAt, sessionExpiredBefore),
        ),
      );

    const processingReclaimable = and(
      eq(jobQueue.status, JOB_STATUS.PROCESSING),
      or(
        isNull(jobQueue.attemptId),
        notExists(matchingOwnerSession),
        and(lte(jobQueue.leaseExpiresAt, now), exists(staleOwnerSession)),
      ),
    );
    const terminalReclaim = sql`${jobQueue.status} = ${JOB_STATUS.PROCESSING} AND ${jobQueue.retryCount} + 1 > ${jobQueue.maxRetries}`;

    const candidate = this.db
      .select({ id: jobQueue.id })
      .from(jobQueue)
      .where(
        or(
          and(
            eq(jobQueue.status, JOB_STATUS.PENDING),
            lte(jobQueue.scheduledFor, now),
          ),
          processingReclaimable,
        ),
      )
      .orderBy(asc(jobQueue.priority), asc(jobQueue.createdAt))
      .limit(1);

    const result = await this.db
      .update(jobQueue)
      .set({
        status: sql`CASE WHEN ${terminalReclaim} THEN ${JOB_STATUS.FAILED} ELSE ${JOB_STATUS.PROCESSING} END`,
        retryCount: sql`CASE WHEN ${jobQueue.status} = ${JOB_STATUS.PROCESSING} THEN ${jobQueue.retryCount} + 1 ELSE ${jobQueue.retryCount} END`,
        lastError: sql`CASE WHEN ${jobQueue.status} = ${JOB_STATUS.PROCESSING} THEN 'Attempt lease expired' ELSE ${jobQueue.lastError} END`,
        startedAt: sql`CASE WHEN ${terminalReclaim} THEN ${jobQueue.startedAt} ELSE ${now} END`,
        completedAt: sql`CASE WHEN ${terminalReclaim} THEN ${now} ELSE NULL END`,
        attemptId: sql`CASE WHEN ${terminalReclaim} THEN ${jobQueue.attemptId} ELSE ${attemptId} END`,
        workerSlotId: sql`CASE WHEN ${terminalReclaim} THEN ${jobQueue.workerSlotId} ELSE ${workerSlotId} END`,
        workerSessionId: sql`CASE WHEN ${terminalReclaim} THEN ${jobQueue.workerSessionId} ELSE ${workerSessionId} END`,
        leaseExpiresAt: sql`CASE WHEN ${terminalReclaim} THEN ${jobQueue.leaseExpiresAt} ELSE ${now + leaseDurationMs} END`,
        attemptHeartbeatAt: sql`CASE WHEN ${terminalReclaim} THEN ${jobQueue.attemptHeartbeatAt} ELSE ${now} END`,
      })
      .where(and(inArray(jobQueue.id, candidate), exists(claimingSession)))
      .returning();

    const claimed = result[0];
    if (claimed?.status !== JOB_STATUS.PROCESSING) return null;

    this.logger.debug("Job claimed", {
      jobId: claimed.id,
      attemptId: claimed.attemptId,
      workerSlotId,
      workerSessionId,
    });
    return claimed;
  }

  private attemptWriteGuard(
    jobId: string,
    attemptId?: string,
  ): SQL | undefined {
    return attemptId
      ? and(
          eq(jobQueue.id, jobId),
          eq(jobQueue.status, JOB_STATUS.PROCESSING),
          eq(jobQueue.attemptId, attemptId),
        )
      : and(
          eq(jobQueue.id, jobId),
          isNull(jobQueue.attemptId),
          or(
            eq(jobQueue.status, JOB_STATUS.PENDING),
            eq(jobQueue.status, JOB_STATUS.PROCESSING),
          ),
        );
  }
}
