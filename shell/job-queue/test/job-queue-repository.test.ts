import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createId } from "@brains/utils/id";
import { createJobQueueDatabase } from "../src/db";
import {
  JobQueueRepository,
  type AtomicJobData,
  type JobAttemptClaim,
  type JobQueueWriteTransactionClient,
} from "../src/job-queue-repository";
import { JOB_STATUS } from "../src/schemas";
import type { InsertJobQueue } from "../src/schema/job-queue";
import type { JobQueueDbConfig } from "../src/types";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";
import type {
  Client,
  InStatement,
  ResultSet,
  Transaction,
} from "@libsql/client";

type TestInsertJob = Omit<InsertJobQueue, "id"> & { id: string };

class BusyCommitError extends Error {
  public readonly code = "SQLITE_BUSY";
}

class CommitConflictTransaction implements Transaction {
  public commitCalls = 0;
  private readonly delegate: Transaction;
  private readonly failures: number;

  constructor(delegate: Transaction, failures: number) {
    this.delegate = delegate;
    this.failures = failures;
  }

  public execute(statement: InStatement): Promise<ResultSet> {
    return this.delegate.execute(statement);
  }

  public batch(statements: InStatement[]): Promise<ResultSet[]> {
    return this.delegate.batch(statements);
  }

  public executeMultiple(sql: string): Promise<void> {
    return this.delegate.executeMultiple(sql);
  }

  public rollback(): Promise<void> {
    return this.delegate.rollback();
  }

  public async commit(): Promise<void> {
    this.commitCalls++;
    if (this.commitCalls <= this.failures) {
      throw new BusyCommitError("database is locked");
    }
    await this.delegate.commit();
  }

  public close(): void {
    this.delegate.close();
  }

  public get closed(): boolean {
    return this.delegate.closed;
  }
}

function createTestJob(overrides: Partial<InsertJobQueue> = {}): TestInsertJob {
  const { id: overrideId, ...restOverrides } = overrides;
  const id = overrideId ?? createId();
  const now = 1_000;

  return {
    id,
    type: "test:job",
    data: JSON.stringify({ id }),
    status: JOB_STATUS.PENDING,
    priority: 0,
    maxRetries: 3,
    retryCount: 0,
    source: null,
    metadata: { operationType: "data_processing", rootJobId: id },
    createdAt: now,
    scheduledFor: now,
    result: null,
    lastError: null,
    startedAt: null,
    completedAt: null,
    ...restOverrides,
  };
}

function createAtomicTestJob(
  overrides: Partial<AtomicJobData> = {},
): AtomicJobData {
  const id = overrides.id ?? createId();
  return {
    id,
    type: "test:job",
    data: JSON.stringify({ id }),
    status: JOB_STATUS.PENDING,
    priority: 0,
    maxRetries: 3,
    retryCount: 0,
    source: null,
    metadata: { operationType: "data_processing", rootJobId: id },
    createdAt: 1_000,
    scheduledFor: 1_000,
    result: null,
    lastError: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function claimOptions(
  overrides: Partial<JobAttemptClaim> = {},
): JobAttemptClaim {
  return {
    now: 10_000,
    attemptId: createId(),
    workerSlotId: "worker-a",
    workerSessionId: "session-a",
    leaseDurationMs: 1_000,
    executableTypes: ["test:job", "type:a", "type:b"],
    ...overrides,
  };
}

describe("JobQueueRepository fenced attempts", () => {
  let config: JobQueueDbConfig;
  let cleanup: () => Promise<void>;
  let client: Client;
  let repository: JobQueueRepository;

  function createRepository(): {
    client: Client;
    repository: JobQueueRepository;
  } {
    const database = createJobQueueDatabase(config);
    return {
      client: database.client,
      repository: new JobQueueRepository(
        database.db,
        database.client,
        database.url,
        createSilentLogger(),
      ),
    };
  }

  beforeEach(async () => {
    const testDb = await createTestJobQueueDatabase();
    config = testDb.config;
    cleanup = testDb.cleanup;
    const created = createRepository();
    client = created.client;
    repository = created.repository;
  });

  afterEach(async () => {
    client.close();
    await cleanup();
  });

  it("atomically claims a pending job with attempt ownership and a lease", async () => {
    const job = createTestJob();
    const claim = claimOptions();
    await repository.insert(job);
    await repository.startWorkerSession(
      claim.workerSlotId,
      claim.workerSessionId,
      claim.now,
    );

    const claimed = await repository.claimNextReady(claim);

    expect(claimed).toMatchObject({
      id: job.id,
      status: JOB_STATUS.PROCESSING,
      attemptId: claim.attemptId,
      workerSlotId: claim.workerSlotId,
      workerSessionId: claim.workerSessionId,
      startedAt: claim.now,
      attemptHeartbeatAt: claim.now,
      leaseExpiresAt: claim.now + claim.leaseDurationMs,
    });
  });

  it("only lets one concurrent worker claim a pending row", async () => {
    const job = createTestJob();
    await repository.insert(job);
    await repository.startWorkerSession("worker-a", "session-a", 10_000);
    await repository.startWorkerSession("worker-b", "session-b", 10_000);
    const second = createRepository();

    try {
      const claims = await Promise.all([
        repository.claimNextReady(claimOptions()),
        second.repository.claimNextReady(
          claimOptions({
            attemptId: createId(),
            workerSlotId: "worker-b",
            workerSessionId: "session-b",
          }),
        ),
      ]);

      expect(claims.filter((claim) => claim?.id === job.id)).toHaveLength(1);
      expect(claims.filter(Boolean)).toHaveLength(1);
    } finally {
      second.client.close();
    }
  });

  it("immediately reclaims an attempt when a new session supersedes the same stable slot", async () => {
    const job = createTestJob();
    const first = claimOptions({ leaseDurationMs: 60_000 });
    await repository.insert(job);
    await repository.startWorkerSession("worker-a", "session-a", first.now);
    const firstClaim = await repository.claimNextReady(first);

    await repository.startWorkerSession("worker-a", "session-b", first.now + 1);
    const second = claimOptions({
      now: first.now + 1,
      attemptId: createId(),
      workerSessionId: "session-b",
      leaseDurationMs: 60_000,
    });
    const reclaimed = await repository.claimNextReady(second);

    expect(firstClaim?.attemptId).toBe(first.attemptId);
    expect(reclaimed).toMatchObject({
      id: job.id,
      attemptId: second.attemptId,
      workerSessionId: "session-b",
      retryCount: 1,
      lastError: "Attempt lease expired",
    });
  });

  it("does not reclaim another slot's attempt while its worker session is live", async () => {
    const job = createTestJob();
    await repository.insert(job);
    await repository.startWorkerSession("worker-a", "session-a", 10_000, 500);
    await repository.claimNextReady(claimOptions({ leaseDurationMs: 100 }));

    await repository.startWorkerSession("worker-b", "session-b", 10_200);
    const reclaimed = await repository.claimNextReady(
      claimOptions({
        now: 10_200,
        attemptId: createId(),
        workerSlotId: "worker-b",
        workerSessionId: "session-b",
      }),
    );

    expect(reclaimed).toBeNull();
  });

  it("reclaims another slot's attempt only after both its lease and owner session expire", async () => {
    const job = createTestJob();
    await repository.insert(job);
    await repository.startWorkerSession("worker-a", "session-a", 10_000, 500);
    await repository.claimNextReady(claimOptions({ leaseDurationMs: 100 }));
    await repository.startWorkerSession("worker-b", "session-b", 10_700);

    const reclaimed = await repository.claimNextReady(
      claimOptions({
        now: 10_700,
        attemptId: createId(),
        workerSlotId: "worker-b",
        workerSessionId: "session-b",
      }),
    );

    expect(reclaimed).toMatchObject({
      id: job.id,
      workerSlotId: "worker-b",
      workerSessionId: "session-b",
      retryCount: 1,
    });
  });

  it("renews long-running attempt and worker-session liveness with fenced heartbeats", async () => {
    const job = createTestJob();
    const claim = claimOptions({ leaseDurationMs: 100 });
    await repository.insert(job);
    await repository.startWorkerSession("worker-a", "session-a", 10_000, 500);
    await repository.claimNextReady(claim);

    expect(
      await repository.heartbeatWorkerSession(
        "worker-a",
        "session-a",
        10_400,
        500,
      ),
    ).toBe(true);
    expect(
      await repository.renewAttemptLease(job.id, claim.attemptId, 10_400, 500),
    ).toBe(true);

    await repository.startWorkerSession("worker-b", "session-b", 10_700);
    const reclaimed = await repository.claimNextReady(
      claimOptions({
        now: 10_700,
        attemptId: createId(),
        workerSlotId: "worker-b",
        workerSessionId: "session-b",
      }),
    );
    const stored = await repository.getStatus(job.id);

    expect(reclaimed).toBeNull();
    expect(stored?.attemptHeartbeatAt).toBe(10_400);
    expect(stored?.leaseExpiresAt).toBe(10_900);
  });

  it("rejects an old session heartbeat after that stable slot is superseded", async () => {
    await repository.startWorkerSession("worker-a", "session-a", 10_000);
    await repository.startWorkerSession("worker-a", "session-b", 10_001);

    expect(
      await repository.heartbeatWorkerSession("worker-a", "session-a", 10_002),
    ).toBe(false);
    expect(
      await repository.heartbeatWorkerSession("worker-a", "session-b", 10_002),
    ).toBe(true);
  });

  it("prevents an expired worker session from claiming new work", async () => {
    const job = createTestJob();
    await repository.insert(job);
    await repository.startWorkerSession("worker-a", "session-a", 10_000, 500);

    expect(
      await repository.claimNextReady(claimOptions({ now: 10_500 })),
    ).toBeNull();
  });

  it("prevents a superseded worker session from claiming new work", async () => {
    const job = createTestJob();
    await repository.insert(job);
    await repository.startWorkerSession("worker-a", "session-a", 10_000);
    await repository.startWorkerSession("worker-a", "session-b", 10_001);

    const obsoleteClaim = await repository.claimNextReady(
      claimOptions({ now: 10_002 }),
    );
    const currentClaim = await repository.claimNextReady(
      claimOptions({
        now: 10_002,
        attemptId: createId(),
        workerSessionId: "session-b",
      }),
    );

    expect(obsoleteClaim).toBeNull();
    expect(currentClaim?.id).toBe(job.id);
  });

  it("fences completion, failure, data, and progress writes from an obsolete attempt", async () => {
    const job = createTestJob();
    const first = claimOptions({ leaseDurationMs: 60_000 });
    await repository.insert(job);
    await repository.startWorkerSession("worker-a", "session-a", first.now);
    await repository.claimNextReady(first);
    await repository.startWorkerSession("worker-a", "session-b", first.now + 1);
    const second = claimOptions({
      now: first.now + 1,
      attemptId: createId(),
      workerSessionId: "session-b",
      leaseDurationMs: 60_000,
    });
    await repository.claimNextReady(second);

    expect(
      await repository.complete(job.id, { stale: true }, first.attemptId),
    ).toBe(false);
    expect(
      await repository.fail(job.id, new Error("stale"), first.attemptId),
    ).toBe(false);
    expect(
      await repository.update(job.id, { stale: true }, first.attemptId),
    ).toBe(false);
    expect(
      await repository.recordAttemptProgress(
        job.id,
        first.attemptId,
        { progress: 10 },
        10_100,
      ),
    ).toBe(false);

    expect(
      await repository.recordAttemptProgress(
        job.id,
        second.attemptId,
        { progress: 10 },
        10_100,
      ),
    ).toBe(true);
    expect(
      await repository.complete(job.id, { current: true }, second.attemptId),
    ).toBe(true);
    expect(await repository.getStatus(job.id)).toMatchObject({
      status: JOB_STATUS.COMPLETED,
      result: { current: true },
    });
  });

  it("uses the covering index for durable cursor seeks", async () => {
    const index = await client.execute(
      "PRAGMA index_info('idx_job_queue_runtime_updates')",
    );
    const plan = await client.execute({
      sql: `EXPLAIN QUERY PLAN
        SELECT * FROM job_queue
        WHERE runtimeUpdatedAt >= ?
        ORDER BY runtimeUpdatedAt, id`,
      args: [0],
    });

    expect(index.rows.map((row) => row["name"])).toEqual([
      "runtimeUpdatedAt",
      "id",
    ]);
    expect(plan.rows.map((row) => String(row["detail"]))).toEqual([
      expect.stringContaining(
        "SEARCH job_queue USING INDEX idx_job_queue_runtime_updates",
      ),
    ]);
  });

  it("skips cursor ties after seeking by update timestamp", async () => {
    const jobs = ["a-job", "b-job", "c-job"].map((id) => createTestJob({ id }));
    for (const job of jobs) await repository.insert(job);
    await client.execute(
      "UPDATE job_queue SET runtimeUpdatedAt = 100 WHERE id IN ('a-job', 'b-job', 'c-job')",
    );

    const updates = await repository.getRuntimeUpdates(
      { updatedAt: 100, jobId: "b-job" },
      1,
    );

    expect(updates.map((update) => update.job.id)).toEqual(["c-job"]);
  });

  it("streams durable progress and terminal snapshots through a stable cursor", async () => {
    const job = createTestJob();
    const claim = claimOptions();
    await repository.insert(job);
    await repository.startWorkerSession(
      claim.workerSlotId,
      claim.workerSessionId,
      claim.now,
    );
    await repository.claimNextReady(claim);

    await repository.recordAttemptProgress(
      job.id,
      claim.attemptId,
      { progress: 1, total: 2, message: "first" },
      10_100,
    );
    const first = await repository.getRuntimeUpdates(
      { updatedAt: 0, jobId: "" },
      10,
    );
    expect(first).toHaveLength(1);
    expect(first[0]?.job.progress).toEqual({
      progress: 1,
      total: 2,
      message: "first",
    });

    await repository.recordAttemptProgress(
      job.id,
      claim.attemptId,
      { progress: 2, total: 2, message: "second" },
      10_100,
    );
    const second = await repository.getRuntimeUpdates(
      first[0]?.cursor ?? { updatedAt: 0, jobId: "" },
      10,
    );
    expect(second).toHaveLength(1);
    expect(second[0]?.job.progress?.message).toBe("second");

    await repository.complete(job.id, { success: true }, claim.attemptId);
    const terminal = await repository.getRuntimeUpdates(
      second[0]?.cursor ?? { updatedAt: 0, jobId: "" },
      10,
    );
    expect(terminal).toHaveLength(1);
    expect(terminal[0]?.job.status).toBe(JOB_STATUS.COMPLETED);
  });

  it("does not skip a lower-id update written in the cursor timestamp", async () => {
    const higherIdJob = createTestJob({
      id: "z-job",
      status: JOB_STATUS.PROCESSING,
      attemptId: "attempt-z",
    });
    const lowerIdJob = createTestJob({
      id: "a-job",
      status: JOB_STATUS.PROCESSING,
      attemptId: "attempt-a",
    });
    await repository.insert(higherIdJob);
    await repository.insert(lowerIdJob);

    await repository.recordAttemptProgress(
      higherIdJob.id,
      "attempt-z",
      { progress: 1 },
      10_100,
    );
    const first = await repository.getRuntimeUpdates(
      { updatedAt: 0, jobId: "" },
      1,
    );

    await repository.recordAttemptProgress(
      lowerIdJob.id,
      "attempt-a",
      { progress: 1 },
      10_100,
    );
    const second = await repository.getRuntimeUpdates(
      first[0]?.cursor ?? { updatedAt: 0, jobId: "" },
      1,
    );

    expect(first[0]?.job.id).toBe(higherIdJob.id);
    expect(second[0]?.job.id).toBe(lowerIdJob.id);
    expect(second[0]?.cursor.updatedAt).toBeGreaterThan(
      first[0]?.cursor.updatedAt ?? 0,
    );
  });

  it("terminally fails an expired attempt when reclaim exceeds max retries", async () => {
    const job = createTestJob({ maxRetries: 0 });
    const first = claimOptions();
    await repository.insert(job);
    await repository.startWorkerSession("worker-a", "session-a", first.now);
    await repository.claimNextReady(first);
    await repository.startWorkerSession("worker-a", "session-b", first.now + 1);

    const reclaimed = await repository.claimNextReady(
      claimOptions({
        now: first.now + 1,
        attemptId: createId(),
        workerSessionId: "session-b",
      }),
    );
    const stored = await repository.getStatus(job.id);
    const updates = await repository.getRuntimeUpdates(
      { updatedAt: 0, jobId: "" },
      1,
    );

    expect(reclaimed).toBeNull();
    expect(stored).toMatchObject({
      status: JOB_STATUS.FAILED,
      retryCount: 1,
      lastError: "Attempt lease expired",
      completedAt: first.now + 1,
    });
    expect(stored?.runtimeUpdatedAt).not.toBeNull();
    expect(updates).toHaveLength(1);
  });

  it("reports bounded queue depth, age, type, and stale-lease diagnostics", async () => {
    const pending = createTestJob({
      id: "pending",
      type: "type:a",
      scheduledFor: 1_000,
    });
    const processing = createTestJob({ id: "processing", type: "type:b" });
    const completed = createTestJob({
      id: "completed",
      type: "type:a",
      status: JOB_STATUS.COMPLETED,
      completedAt: 9_000,
    });
    await repository.insert(pending);
    await repository.insert(processing);
    await repository.insert(completed);
    await repository.startWorkerSession("worker-a", "session-a", 10_000);
    await repository.startWorkerSession("worker-b", "session-b", -4_000);
    await repository.claimNextReady(claimOptions());

    const diagnostics = await repository.getDiagnostics(12_000);

    expect(diagnostics).toMatchObject({
      totals: {
        pending: 1,
        processing: 1,
        completed: 1,
        failed: 0,
      },
      oldestPendingAgeMs: 11_000,
      duePending: 1,
      oldestDuePendingAgeMs: 11_000,
      latestClaimAgeMs: 2_000,
      oldestProcessingAgeMs: 2_000,
      staleLeaseCount: 1,
      workerSessions: {
        total: 2,
        active: 1,
        stale: 1,
        latestHeartbeatAgeMs: 2_000,
      },
    });
    expect(diagnostics.byType).toEqual(
      expect.arrayContaining([
        { type: "type:a", status: JOB_STATUS.PROCESSING, count: 1 },
        { type: "type:a", status: JOB_STATUS.COMPLETED, count: 1 },
        { type: "type:b", status: JOB_STATUS.PENDING, count: 1 },
      ]),
    );
  });

  it("uses each worker's persisted session expiry in diagnostics", async () => {
    await repository.startWorkerSession(
      "worker-custom",
      "session-custom",
      10_000,
      30_000,
    );

    expect((await repository.getDiagnostics(30_000)).workerSessions).toEqual({
      total: 1,
      active: 1,
      stale: 0,
      latestHeartbeatAgeMs: 20_000,
    });
    expect((await repository.getDiagnostics(40_000)).workerSessions).toEqual({
      total: 1,
      active: 0,
      stale: 1,
      latestHeartbeatAgeMs: 30_000,
    });
  });

  it("excludes future-scheduled jobs from due diagnostics", async () => {
    await repository.insert(
      createTestJob({
        id: "future",
        type: "type:a",
        createdAt: 1_000,
        scheduledFor: 20_000,
      }),
    );

    const diagnostics = await repository.getDiagnostics(12_000);

    expect(diagnostics).toMatchObject({
      totals: { pending: 1 },
      oldestPendingAgeMs: 11_000,
      duePending: 0,
      oldestDuePendingAgeMs: null,
      latestClaimAgeMs: null,
    });
  });

  it("retries recognized write-transaction acquisition conflicts", async () => {
    const database = createJobQueueDatabase(config);
    let attempts = 0;
    const transaction = mock(async () => {
      attempts++;
      if (attempts < 3) {
        throw Object.assign(new Error("database is locked"), {
          code: "SQLITE_BUSY",
        });
      }
      return database.client.transaction("write");
    });
    const transactionClient: JobQueueWriteTransactionClient = { transaction };
    const retryingRepository = new JobQueueRepository(
      database.db,
      transactionClient,
      `${database.url}:retry-test`,
      createSilentLogger(),
    );
    const job = createAtomicTestJob({ type: "type:a" });

    try {
      const decision = await retryingRepository.enqueueAtomic({
        jobData: job,
        strategy: "skip",
        deduplicationKey: "retry",
      });

      expect(decision).toEqual({ kind: "inserted", jobId: job.id });
      expect(transaction).toHaveBeenCalledTimes(3);
    } finally {
      database.client.close();
    }
  });

  it("retries commit conflicts without replaying the transaction body", async () => {
    const database = createJobQueueDatabase(config);
    let wrappedTransaction: CommitConflictTransaction | undefined;
    const transactionClient: JobQueueWriteTransactionClient = {
      transaction: async (mode) => {
        const transaction = await database.client.transaction(mode);
        wrappedTransaction = new CommitConflictTransaction(transaction, 2);
        return wrappedTransaction;
      },
    };
    const committingRepository = new JobQueueRepository(
      database.db,
      transactionClient,
      `${database.url}:commit-retry-test`,
      createSilentLogger(),
    );
    const beforeInsert = mock(async () => {});
    const job = createAtomicTestJob({ type: "type:a" });

    try {
      const decision = await committingRepository.enqueueAtomic({
        jobData: job,
        strategy: "skip",
        beforeInsert,
      });
      if (!wrappedTransaction) {
        throw new Error("Expected a wrapped write transaction");
      }

      expect(decision).toEqual({ kind: "inserted", jobId: job.id });
      expect(wrappedTransaction.commitCalls).toBe(3);
      expect(beforeInsert).toHaveBeenCalledTimes(1);
      expect((await committingRepository.getStatus(job.id))?.status).toBe(
        JOB_STATUS.PENDING,
      );
    } finally {
      database.client.close();
    }
  });

  it("outlasts commit contention beyond any fixed attempt cap", async () => {
    const database = createJobQueueDatabase(config);
    let wrappedTransaction: CommitConflictTransaction | undefined;
    const transactionClient: JobQueueWriteTransactionClient = {
      transaction: async (mode) => {
        const transaction = await database.client.transaction(mode);
        wrappedTransaction = new CommitConflictTransaction(transaction, 8);
        return wrappedTransaction;
      },
    };
    const committingRepository = new JobQueueRepository(
      database.db,
      transactionClient,
      `${database.url}:commit-contention-test`,
      createSilentLogger(),
    );
    const job = createAtomicTestJob({ type: "type:a" });

    try {
      const decision = await committingRepository.enqueueAtomic({
        jobData: job,
        strategy: "skip",
        beforeInsert: mock(async () => {}),
      });

      expect(decision).toEqual({ kind: "inserted", jobId: job.id });
      expect(wrappedTransaction?.commitCalls).toBe(9);
    } finally {
      database.client.close();
    }
  });

  it("rolls back after commit conflict exhaustion without replaying insertion", async () => {
    const database = createJobQueueDatabase(config);
    const transactionClient: JobQueueWriteTransactionClient = {
      transaction: async (mode) =>
        new CommitConflictTransaction(
          await database.client.transaction(mode),
          Number.POSITIVE_INFINITY,
        ),
    };
    const committingRepository = new JobQueueRepository(
      database.db,
      transactionClient,
      `${database.url}:commit-exhaustion-test`,
      createSilentLogger(),
      { writeRetryBudgetMs: 60 },
    );
    const beforeInsert = mock(async () => {});
    const job = createAtomicTestJob({ type: "type:a" });

    try {
      void expect(
        committingRepository.enqueueAtomic({
          jobData: job,
          strategy: "skip",
          beforeInsert,
        }),
      ).rejects.toThrow(
        /Failed to commit atomic enqueue transaction for type "type:a" within \d+ms/,
      );
      expect(beforeInsert).toHaveBeenCalledTimes(1);
      expect(await committingRepository.getStatus(job.id)).toBeNull();
    } finally {
      database.client.close();
    }
  });

  it("returns actionable context after transaction conflict exhaustion", async () => {
    const database = createJobQueueDatabase(config);
    const transaction = mock(async () => {
      throw Object.assign(new Error("database is locked"), {
        code: "SQLITE_BUSY",
      });
    });
    const transactionClient: JobQueueWriteTransactionClient = { transaction };
    const exhaustedRepository = new JobQueueRepository(
      database.db,
      transactionClient,
      `${database.url}:exhaustion-test`,
      createSilentLogger(),
      { writeRetryBudgetMs: 60 },
    );

    try {
      void expect(
        exhaustedRepository.enqueueAtomic({
          jobData: createAtomicTestJob({
            type: "type:a",
            data: "secret-payload",
          }),
          strategy: "coalesce",
          deduplicationKey: "present-key",
        }),
      ).rejects.toThrow(
        /Failed to acquire atomic enqueue transaction for type "type:a" within \d+ms after \d+ attempts \(strategy: coalesce, key: present\)/,
      );
      expect(transaction.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      database.client.close();
    }
  });

  it("does not retry unknown transaction acquisition errors", async () => {
    const database = createJobQueueDatabase(config);
    const unknownError = new Error("authentication failed");
    const transaction = mock(async () => {
      throw unknownError;
    });
    const transactionClient: JobQueueWriteTransactionClient = { transaction };
    const failingRepository = new JobQueueRepository(
      database.db,
      transactionClient,
      `${database.url}:unknown-error-test`,
      createSilentLogger(),
    );

    try {
      void expect(
        failingRepository.enqueueAtomic({
          jobData: createAtomicTestJob(),
          strategy: "skip",
        }),
      ).rejects.toBe(unknownError);
      expect(transaction).toHaveBeenCalledTimes(1);
    } finally {
      database.client.close();
    }
  });

  it("orders pending and reclaimable jobs by priority then creation time", async () => {
    const reclaimable = createTestJob({
      id: "reclaimable",
      status: JOB_STATUS.PROCESSING,
      createdAt: 100,
      startedAt: 100,
      attemptId: "old-attempt",
      workerSlotId: "worker-a",
      workerSessionId: "superseded-session",
      leaseExpiresAt: 100,
      attemptHeartbeatAt: 100,
    });
    const pending = createTestJob({
      id: "pending",
      status: JOB_STATUS.PENDING,
      createdAt: 200,
      scheduledFor: 10_000,
    });
    await repository.insert(reclaimable);
    await repository.insert(pending);
    await repository.startWorkerSession("worker-a", "current-session", 10_000);

    const claimed = await repository.claimNextReady(
      claimOptions({ workerSessionId: "current-session" }),
    );

    expect(claimed?.id).toBe(reclaimable.id);
  });
});
