import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
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
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { KeyedSerialQueue } from "@brains/utils/serial-queue";
import { JOB_STATUS } from "./schemas";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Row, Transaction } from "@libsql/client";
import {
  DEFAULT_WORKER_SESSION_TIMEOUT_MS,
  type JobInfo,
  type JobQueueDiagnostics,
  type JobQueueStats,
  type JobRuntimeUpdate,
  type JobRuntimeUpdateCursor,
} from "./types";
import type { ProgressNotification } from "@brains/utils/progress";
import type { DeduplicationStrategy } from "./schema/types";
import {
  JobDeduplicator,
  type DeduplicationCandidate,
} from "./job-deduplicator";

export interface JobAttemptClaim {
  now: number;
  attemptId: string;
  workerSlotId: string;
  workerSessionId: string;
  leaseDurationMs: number;
  executableTypes: readonly string[];
}

export type EnqueueDecision =
  | { kind: "inserted"; jobId: string }
  | { kind: "skipped"; jobId: string }
  | { kind: "coalesced"; jobId: string }
  | { kind: "replaced"; jobId: string; replacedJobId: string };

export interface AtomicJobData {
  id: string;
  type: string;
  data: string;
  status: "pending";
  priority: number;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  createdAt: number;
  scheduledFor: number;
  startedAt: number | null;
  completedAt: number | null;
  source: string | null;
  metadata: JobInfo["metadata"];
  result: unknown;
}

export interface AtomicEnqueueRequest {
  jobData: AtomicJobData;
  strategy?: DeduplicationStrategy | undefined;
  deduplicationKey?: string | undefined;
  beforeInsert?: (() => Promise<void>) | undefined;
}

export interface JobQueueWriteTransactionClient {
  transaction(mode: "write"): Promise<Transaction>;
}

// App-level retries stand in for SQLite's busy_timeout (which would block the
// event loop on local libSQL), so the retry budget is time, not attempts: it
// must absorb a slow winner's entire write-transaction stream under real
// cross-process contention. Any fixed attempt cap re-becomes a flake on a
// starved runner.
const WRITE_RETRY_BUDGET_MS = 2_000;
const WRITE_RETRY_BASE_DELAY_MS = 5;
const WRITE_RETRY_MAX_DELAY_MS = 40;

// Local libSQL begins a write transaction synchronously and can block the event
// loop on busy_timeout when two clients in one process share a file. This turn
// queue prevents that self-deadlock; the explicit database write transaction is
// still the correctness boundary across processes.
const writeTransactions = new KeyedSerialQueue();

/**
 * Database-backed job queue operations.
 * Keeps persistence details out of JobQueueService orchestration logic.
 */
export class JobQueueRepository {
  private db: LibSQLDatabase<Record<string, unknown>>;
  private transactionClient: JobQueueWriteTransactionClient;
  private databaseUrl: string;
  private logger: Logger;
  private deduplicator = new JobDeduplicator();
  private writeRetryBudgetMs: number;

  constructor(
    db: LibSQLDatabase<Record<string, unknown>>,
    transactionClient: JobQueueWriteTransactionClient,
    databaseUrl: string,
    logger: Logger,
    options?: { writeRetryBudgetMs?: number },
  ) {
    this.db = db;
    this.transactionClient = transactionClient;
    this.databaseUrl = databaseUrl;
    this.logger = logger.child("JobQueueRepository");
    this.writeRetryBudgetMs =
      options?.writeRetryBudgetMs ?? WRITE_RETRY_BUDGET_MS;
  }

  public async insert(jobData: InsertJobQueue): Promise<void> {
    await this.db.insert(jobQueue).values(jobData);
  }

  public async enqueueAtomic(
    request: AtomicEnqueueRequest,
  ): Promise<EnqueueDecision> {
    return writeTransactions.run(this.databaseUrl, async () => {
      const transaction = await this.acquireWriteTransaction(request);

      try {
        const decision = await this.decideEnqueue(transaction, request);
        await this.commitWriteTransaction(transaction, request);
        return decision;
      } catch (error) {
        if (!transaction.closed) {
          try {
            await transaction.rollback();
          } catch (rollbackError) {
            this.logger.error("Failed to roll back atomic enqueue", {
              type: request.jobData.type,
              rollbackError,
            });
          }
        }
        throw error;
      } finally {
        transaction.close();
      }
    });
  }

  private async decideEnqueue(
    transaction: Transaction,
    request: AtomicEnqueueRequest,
  ): Promise<EnqueueDecision> {
    const { jobData, strategy, deduplicationKey, beforeInsert } = request;
    const effectiveStrategy = strategy ?? "none";
    const insert = async (): Promise<void> => {
      await beforeInsert?.();
      await this.insertJob(transaction, jobData);
    };

    if (effectiveStrategy === "none") {
      await insert();
      return { kind: "inserted", jobId: jobData.id };
    }

    const activeJobs = await this.getActiveDeduplicationCandidates(
      transaction,
      jobData.type,
    );
    const duplicate = this.deduplicator.findDuplicate(
      activeJobs,
      effectiveStrategy,
      deduplicationKey,
    );

    if (!duplicate) {
      await insert();
      return { kind: "inserted", jobId: jobData.id };
    }

    if (effectiveStrategy === "skip") {
      return { kind: "skipped", jobId: duplicate.id };
    }

    if (effectiveStrategy === "coalesce") {
      const updated = await transaction.execute({
        sql: "UPDATE `job_queue` SET `scheduledFor` = ? WHERE `id` = ? AND `status` = ?",
        args: [Date.now(), duplicate.id, duplicate.status],
      });
      if (updated.rowsAffected !== 1) {
        throw new Error(`Atomic coalesce lost selected job ${duplicate.id}`);
      }
      return { kind: "coalesced", jobId: duplicate.id };
    }

    await beforeInsert?.();
    const now = Date.now();
    const replaced = await transaction.execute({
      sql: `UPDATE \`job_queue\`
            SET \`status\` = ?,
                \`lastError\` = ?,
                \`completedAt\` = ?,
                \`runtimeUpdatedAt\` = max(?, coalesce((SELECT max(\`runtimeUpdatedAt\`) FROM \`job_queue\`), 0) + 1)
            WHERE \`id\` = ? AND \`status\` = ?`,
      args: [
        JOB_STATUS.FAILED,
        "Replaced by newer job",
        now,
        now,
        duplicate.id,
        JOB_STATUS.PENDING,
      ],
    });
    if (replaced.rowsAffected !== 1) {
      throw new Error(`Atomic replace lost selected job ${duplicate.id}`);
    }
    await this.insertJob(transaction, jobData);
    return {
      kind: "replaced",
      jobId: jobData.id,
      replacedJobId: duplicate.id,
    };
  }

  private async getActiveDeduplicationCandidates(
    transaction: Transaction,
    type: string,
  ): Promise<DeduplicationCandidate[]> {
    const result = await transaction.execute({
      sql: `SELECT \`id\`, \`status\`, \`createdAt\`, \`metadata\`
            FROM \`job_queue\`
            WHERE \`type\` = ? AND \`status\` IN (?, ?)`,
      args: [type, JOB_STATUS.PENDING, JOB_STATUS.PROCESSING],
    });
    return result.rows.map((row) => this.parseDeduplicationCandidate(row));
  }

  private parseDeduplicationCandidate(row: Row): DeduplicationCandidate {
    const id = row["id"];
    const status = row["status"];
    const createdAt = row["createdAt"];
    const rawMetadata = row["metadata"];
    if (
      typeof id !== "string" ||
      (status !== JOB_STATUS.PENDING && status !== JOB_STATUS.PROCESSING) ||
      (typeof createdAt !== "number" && typeof createdAt !== "bigint") ||
      typeof rawMetadata !== "string"
    ) {
      throw new Error("Invalid active job row returned during atomic enqueue");
    }

    const metadata: unknown = JSON.parse(rawMetadata);
    return {
      id,
      status,
      createdAt: Number(createdAt),
      metadata,
    };
  }

  private async insertJob(
    transaction: Transaction,
    jobData: AtomicJobData,
  ): Promise<void> {
    const inserted = await transaction.execute({
      sql: `INSERT INTO \`job_queue\` (
              \`id\`, \`type\`, \`data\`, \`result\`, \`source\`, \`metadata\`,
              \`status\`, \`priority\`, \`retryCount\`, \`maxRetries\`,
              \`lastError\`, \`createdAt\`, \`scheduledFor\`, \`startedAt\`,
              \`completedAt\`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        jobData.id,
        jobData.type,
        jobData.data,
        this.serializeJson(jobData.result),
        jobData.source,
        JSON.stringify(jobData.metadata),
        jobData.status,
        jobData.priority,
        jobData.retryCount,
        jobData.maxRetries,
        jobData.lastError,
        jobData.createdAt,
        jobData.scheduledFor,
        jobData.startedAt,
        jobData.completedAt,
      ],
    });
    if (inserted.rowsAffected !== 1) {
      throw new Error(`Atomic enqueue did not insert job ${jobData.id}`);
    }
  }

  private serializeJson(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    return JSON.stringify(value);
  }

  private commitWriteTransaction(
    transaction: Transaction,
    request: AtomicEnqueueRequest,
  ): Promise<void> {
    return this.retryOnConflict(
      "commit",
      request,
      async () => {
        await transaction.commit();
      },
      (error) => this.isSerializationConflict(error) && !transaction.closed,
    );
  }

  private acquireWriteTransaction(
    request: AtomicEnqueueRequest,
  ): Promise<Transaction> {
    return this.retryOnConflict(
      "acquire",
      request,
      () => this.transactionClient.transaction("write"),
      (error) => this.isSerializationConflict(error),
    );
  }

  private async retryOnConflict<T>(
    phase: "acquire" | "commit",
    request: AtomicEnqueueRequest,
    operation: () => Promise<T>,
    isRetryable: (error: unknown) => boolean,
    deadline = Date.now() + this.writeRetryBudgetMs,
    attempt = 1,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryable(error)) throw error;
      const backoff = Math.min(
        WRITE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
        WRITE_RETRY_MAX_DELAY_MS,
      );
      // Jitter half the window so contending processes fall out of lockstep.
      const delay = backoff / 2 + Math.random() * (backoff / 2);
      if (Date.now() + delay >= deadline) {
        throw this.transactionConflictError(phase, request, attempt, error);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retryOnConflict(
        phase,
        request,
        operation,
        isRetryable,
        deadline,
        attempt + 1,
      );
    }
  }

  private transactionConflictError(
    phase: "acquire" | "commit",
    request: AtomicEnqueueRequest,
    attempts: number,
    cause: unknown,
  ): Error {
    const strategy = request.strategy ?? "none";
    const keyPresence = request.deduplicationKey ? "present" : "absent";
    return new Error(
      `Failed to ${phase} atomic enqueue transaction for type "${request.jobData.type}" within ${this.writeRetryBudgetMs}ms after ${attempts} attempts (strategy: ${strategy}, key: ${keyPresence})`,
      { cause },
    );
  }

  private isSerializationConflict(error: unknown): boolean {
    for (let current = error; current !== undefined;) {
      const code =
        typeof current === "object" && current !== null && "code" in current
          ? String(current.code)
          : "";
      const message = getErrorMessage(current, "");
      if (
        /SQLITE_(?:BUSY|LOCKED)/u.test(code) ||
        /SQLITE_(?:BUSY|LOCKED)|database is locked|transaction (?:busy|conflict)/iu.test(
          message,
        )
      ) {
        return true;
      }
      current = current instanceof Error ? current.cause : undefined;
    }
    return false;
  }

  /** Atomically register a new session, superseding the slot's prior session. */
  public async startWorkerSession(
    workerSlotId: string,
    workerSessionId: string,
    now: number = Date.now(),
    workerSessionTimeoutMs: number = DEFAULT_WORKER_SESSION_TIMEOUT_MS,
  ): Promise<void> {
    const expiresAt = now + workerSessionTimeoutMs;
    await this.db
      .insert(jobWorkerSessions)
      .values({
        slotId: workerSlotId,
        sessionId: workerSessionId,
        startedAt: now,
        heartbeatAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: jobWorkerSessions.slotId,
        set: {
          sessionId: workerSessionId,
          startedAt: now,
          heartbeatAt: now,
          expiresAt,
        },
      });
  }

  /** Update liveness only if this session still owns the stable slot. */
  public async heartbeatWorkerSession(
    workerSlotId: string,
    workerSessionId: string,
    now: number = Date.now(),
    workerSessionTimeoutMs: number = DEFAULT_WORKER_SESSION_TIMEOUT_MS,
  ): Promise<boolean> {
    const result = await this.db
      .update(jobWorkerSessions)
      .set({
        heartbeatAt: now,
        expiresAt: now + workerSessionTimeoutMs,
      })
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
        runtimeUpdatedAt: this.nextRuntimeUpdatedAt(now),
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
    progress: ProgressNotification,
    now: number = Date.now(),
  ): Promise<boolean> {
    const updated = await this.db
      .update(jobQueue)
      .set({
        attemptHeartbeatAt: now,
        runtimeUpdatedAt: this.nextRuntimeUpdatedAt(now),
        progress,
      })
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
        runtimeUpdatedAt: jobQueue.runtimeUpdatedAt,
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
        runtimeUpdatedAt: canRetry
          ? job.runtimeUpdatedAt
          : this.nextRuntimeUpdatedAt(now),
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
    const [byTypeRows, ageRows, workerSessionRows] = await Promise.all([
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
          duePending: sql<number>`coalesce(sum(case when ${jobQueue.status} = ${JOB_STATUS.PENDING} and ${jobQueue.scheduledFor} <= ${now} then 1 else 0 end), 0)`,
          oldestDuePendingAt: sql<
            number | null
          >`min(case when ${jobQueue.status} = ${JOB_STATUS.PENDING} and ${jobQueue.scheduledFor} <= ${now} then ${jobQueue.scheduledFor} end)`,
          latestClaimAt: sql<number | null>`max(${jobQueue.startedAt})`,
          oldestProcessingAt: sql<
            number | null
          >`min(case when ${jobQueue.status} = ${JOB_STATUS.PROCESSING} then ${jobQueue.startedAt} end)`,
          staleLeaseCount: sql<number>`coalesce(sum(case when ${jobQueue.status} = ${JOB_STATUS.PROCESSING} and ${jobQueue.leaseExpiresAt} is not null and ${jobQueue.leaseExpiresAt} <= ${now} then 1 else 0 end), 0)`,
        })
        .from(jobQueue),
      this.db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`coalesce(sum(case when ${jobWorkerSessions.expiresAt} > ${now} then 1 else 0 end), 0)`,
          stale: sql<number>`coalesce(sum(case when ${jobWorkerSessions.expiresAt} <= ${now} then 1 else 0 end), 0)`,
          latestHeartbeatAt: sql<
            number | null
          >`max(${jobWorkerSessions.heartbeatAt})`,
        })
        .from(jobWorkerSessions),
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
    const workerSessions = workerSessionRows[0];
    const ageSince = (timestamp: number | null | undefined): number | null =>
      timestamp === null || timestamp === undefined
        ? null
        : Math.max(0, now - Number(timestamp));

    return {
      totals,
      byType,
      oldestPendingAgeMs: ageSince(ages?.oldestPendingAt),
      duePending: Number(ages?.duePending ?? 0),
      oldestDuePendingAgeMs: ageSince(ages?.oldestDuePendingAt),
      latestClaimAgeMs: ageSince(ages?.latestClaimAt),
      oldestProcessingAgeMs: ageSince(ages?.oldestProcessingAt),
      staleLeaseCount: Number(ages?.staleLeaseCount ?? 0),
      workerSessions: {
        total: Number(workerSessions?.total ?? 0),
        active: Number(workerSessions?.active ?? 0),
        stale: Number(workerSessions?.stale ?? 0),
        latestHeartbeatAgeMs: ageSince(workerSessions?.latestHeartbeatAt),
      },
    };
  }

  public async getRuntimeUpdates(
    cursor: JobRuntimeUpdateCursor,
    limit: number,
  ): Promise<JobRuntimeUpdate[]> {
    if (limit <= 0) return [];

    // Row-value cursor predicates don't seek on Turso, so page with two
    // bounded index seeks: ties at the cursor timestamp, then rows beyond it.
    const ties = await this.db
      .select()
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.runtimeUpdatedAt, cursor.updatedAt),
          gt(jobQueue.id, cursor.jobId),
        ),
      )
      .orderBy(asc(jobQueue.id))
      .limit(limit);

    const beyond =
      ties.length < limit
        ? await this.db
            .select()
            .from(jobQueue)
            .where(gt(jobQueue.runtimeUpdatedAt, cursor.updatedAt))
            .orderBy(asc(jobQueue.runtimeUpdatedAt), asc(jobQueue.id))
            .limit(limit - ties.length)
        : [];

    return [...ties, ...beyond].map((job) => ({
      job,
      cursor: {
        updatedAt: job.runtimeUpdatedAt ?? 0,
        jobId: job.id,
      },
    }));
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
   * Atomically claim the highest-priority executable pending or reclaimable job.
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
      executableTypes,
    } = claim;

    const claimingSession = this.db
      .select({ slotId: jobWorkerSessions.slotId })
      .from(jobWorkerSessions)
      .where(
        and(
          eq(jobWorkerSessions.slotId, workerSlotId),
          eq(jobWorkerSessions.sessionId, workerSessionId),
          gt(jobWorkerSessions.expiresAt, now),
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
          lte(jobWorkerSessions.expiresAt, now),
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
        and(
          inArray(jobQueue.type, executableTypes),
          or(
            and(
              eq(jobQueue.status, JOB_STATUS.PENDING),
              lte(jobQueue.scheduledFor, now),
            ),
            processingReclaimable,
          ),
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
        runtimeUpdatedAt: sql`CASE WHEN ${terminalReclaim} THEN ${this.nextRuntimeUpdatedAt(now)} ELSE ${jobQueue.runtimeUpdatedAt} END`,
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

  /** Allocate a globally increasing cursor value within the serialized write. */
  private nextRuntimeUpdatedAt(now: number): SQL<number> {
    return sql<number>`max(${now}, coalesce((select max(${jobQueue.runtimeUpdatedAt}) from ${jobQueue}), 0) + 1)`;
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
