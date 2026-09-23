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

interface CommitConflictState {
  commitCalls: number;
  remainingFailures: number;
}

class CommitConflictTransaction implements Transaction {
  private readonly delegate: Transaction;
  private readonly state: CommitConflictState;

  constructor(delegate: Transaction, state: CommitConflictState) {
    this.delegate = delegate;
    this.state = state;
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
    this.state.commitCalls++;
    if (this.state.remainingFailures > 0) {
      this.state.remainingFailures--;
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

  for (const operation of [
    "claim",
    "progress",
    "lease",
    "session",
    "complete",
    "fail",
    "retry",
  ] as const) {
    it(`waits asynchronously for an enqueue transaction before ${operation}`, async () => {
      const job = createTestJob({ maxRetries: operation === "retry" ? 3 : 0 });
      const pending = createTestJob();
      const claim = claimOptions();
      await repository.insert(job);
      await repository.startWorkerSession(
        claim.workerSlotId,
        claim.workerSessionId,
        claim.now,
      );
      await repository.claimNextReady(claim);
      await repository.insert(pending);
      let release!: () => void;
      let entered!: () => void;
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const acquired = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const enqueue = repository.enqueueAtomic({
        jobData: createAtomicTestJob({ scheduledFor: 20_000 }),
        beforeInsert: async () => {
          entered();
          await hold;
        },
      });
      await acquired;
      const execute = async (): Promise<unknown> => {
        switch (operation) {
          case "claim":
            return repository.claimNextReady(claimOptions());
          case "progress":
            return repository.recordAttemptProgress(
              job.id,
              claim.attemptId,
              { message: "rendering", progress: 50, total: 100 },
              claim.now,
            );
          case "lease":
            return repository.renewAttemptLease(
              job.id,
              claim.attemptId,
              claim.now,
              2_000,
            );
          case "session":
            return repository.heartbeatWorkerSession(
              claim.workerSlotId,
              claim.workerSessionId,
              claim.now,
            );
          case "complete":
            return repository.complete(job.id, { ok: true }, claim.attemptId);
          case "fail":
          case "retry":
            return repository.fail(
              job.id,
              new Error("handler failed"),
              claim.attemptId,
              claim.now,
            );
        }
      };
      const outcome = execute().then(
        (value) => ({ value, error: undefined }),
        (error) => ({ value: undefined, error }),
      );
      try {
        // Releasing on the event loop proves this does not use a synchronous busy wait.
        await Bun.sleep(40);
      } finally {
        release();
        await enqueue;
      }
      const result = await outcome;
      expect(result.error).toBeUndefined();
      if (operation === "claim")
        expect(result.value).toMatchObject({
          id: pending.id,
          status: JOB_STATUS.PROCESSING,
          retryCount: 0,
        });
      else expect(result.value).toBe(true);
      const persisted = await repository.getStatus(job.id);
      if (operation === "complete")
        expect(persisted?.status).toBe(JOB_STATUS.COMPLETED);
      if (operation === "fail")
        expect(persisted).toMatchObject({
          status: JOB_STATUS.FAILED,
          retryCount: 0,
          lastError: "handler failed",
        });
      if (operation === "retry")
        expect(persisted).toMatchObject({
          status: JOB_STATUS.PENDING,
          retryCount: 1,
          attemptId: null,
          lastError: "handler failed",
        });
      if (operation === "progress")
        expect(persisted?.progress).toMatchObject({ progress: 50 });
      if (operation === "lease")
        expect(persisted?.leaseExpiresAt).toBe(claim.now + 2_000);
    });
  }

  for (const operation of [
    "complete",
    "fail",
    "progress",
    "lease",
    "update",
  ] as const) {
    it(`preserves the replacement attempt when ${operation} waits on an external writer`, async () => {
      const job = createTestJob();
      const claim = claimOptions();
      await repository.insert(job);
      await repository.startWorkerSession(
        claim.workerSlotId,
        claim.workerSessionId,
        claim.now,
      );
      await repository.claimNextReady(claim);
      const other = createRepository();
      const transaction = await other.client.transaction("write");
      try {
        await transaction.execute({
          sql: "UPDATE job_queue SET attemptId = ? WHERE id = ?",
          args: ["replacement", job.id],
        });
        const execute = async (): Promise<boolean> => {
          switch (operation) {
            case "complete":
              return repository.complete(job.id, {}, claim.attemptId);
            case "fail":
              return repository.fail(
                job.id,
                new Error("old failure"),
                claim.attemptId,
              );
            case "progress":
              return repository.recordAttemptProgress(job.id, claim.attemptId, {
                message: "old progress",
                progress: 20,
                total: 100,
              });
            case "lease":
              return repository.renewAttemptLease(
                job.id,
                claim.attemptId,
                claim.now,
                2_000,
              );
            case "update":
              return repository.update(job.id, { old: true }, claim.attemptId);
          }
        };
        const outcome = execute().then(
          (value) => ({ value, error: undefined }),
          (error) => ({ value: undefined, error }),
        );
        await Bun.sleep(30);
        await transaction.commit();
        const result = await outcome;
        expect(result.error).toBeUndefined();
        expect(result.value).toBe(false);
        expect(await repository.getStatus(job.id)).toMatchObject({
          status: JOB_STATUS.PROCESSING,
          attemptId: "replacement",
          retryCount: 0,
          lastError: null,
          result: null,
          progress: null,
          data: job.data,
        });
      } finally {
        if (!transaction.closed) await transaction.rollback();
        transaction.close();
        other.client.close();
      }
    });
  }

  it("bounds lock retries and never performs a delayed write after exhaustion", async () => {
    const job = createTestJob();
    const claim = claimOptions();
    await repository.insert(job);
    await repository.startWorkerSession(
      claim.workerSlotId,
      claim.workerSessionId,
      claim.now,
    );
    await repository.claimNextReady(claim);
    const database = createJobQueueDatabase(config);
    const bounded = new JobQueueRepository(
      database.db,
      database.client,
      database.url,
      createSilentLogger(),
      { writeRetryBudgetMs: 40 },
    );
    const transaction = await client.transaction("write");
    try {
      const start = Date.now();
      const failure = await bounded.complete(job.id, {}, claim.attemptId).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty(
        "message",
        expect.stringContaining(
          'Failed job queue write "complete" within 40ms',
        ),
      );
      expect(Date.now() - start).toBeLessThan(1_000);
      await transaction.rollback();
      await Bun.sleep(60);
      expect(await repository.getStatus(job.id)).toMatchObject({
        status: JOB_STATUS.PROCESSING,
        attemptId: claim.attemptId,
        retryCount: 0,
        result: null,
      });
    } finally {
      if (!transaction.closed) await transaction.rollback();
      transaction.close();
      database.client.close();
    }
  });

  it("does not retry a constraint error whose query payload mentions SQLITE_BUSY", async () => {
    const job = createTestJob({
      data: JSON.stringify({ message: "SQLITE_BUSY: database is locked" }),
    });
    await repository.insert(job);
    const original = client.execute.bind(client);
    const execute = mock((statement: InStatement) => original(statement));
    client.execute = execute;
    try {
      const failure = await repository.insert(job).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(execute).toHaveBeenCalledTimes(1);
    } finally {
      client.execute = original;
    }
  });

  it("does not heartbeat a replacement worker session after waiting for its writer", async () => {
    await repository.startWorkerSession("worker-a", "session-a", 10_000);
    const other = createRepository();
    const transaction = await other.client.transaction("write");
    try {
      await transaction.execute(
        "UPDATE job_worker_sessions SET sessionId = 'replacement' WHERE slotId = 'worker-a'",
      );
      const heartbeat = repository
        .heartbeatWorkerSession("worker-a", "session-a", 11_000)
        .then(
          (value) => ({ value, error: undefined }),
          (error) => ({ value: undefined, error }),
        );
      await Bun.sleep(30);
      await transaction.commit();
      expect(await heartbeat).toEqual({ value: false, error: undefined });
      const row = await other.client.execute(
        "SELECT sessionId, heartbeatAt FROM job_worker_sessions WHERE slotId='worker-a'",
      );
      expect(row.rows[0]).toMatchObject({
        sessionId: "replacement",
        heartbeatAt: 10_000,
      });
    } finally {
      if (!transaction.closed) await transaction.rollback();
      transaction.close();
      other.client.close();
    }
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
        WHERE (runtimeUpdatedAt, id) > (?, ?)
        ORDER BY runtimeUpdatedAt, id
        LIMIT ?`,
      args: [0, "", 100],
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

  it("replays the transaction after commit conflicts", async () => {
    const database = createJobQueueDatabase(config);
    const commitState: CommitConflictState = {
      commitCalls: 0,
      remainingFailures: 2,
    };
    const transaction = mock(
      async (mode: "write") =>
        new CommitConflictTransaction(
          await database.client.transaction(mode),
          commitState,
        ),
    );
    const transactionClient: JobQueueWriteTransactionClient = { transaction };
    const committingRepository = new JobQueueRepository(
      database.db,
      transactionClient,
      `${database.url}:commit-retry-test`,
      createSilentLogger(),
    );
    const beforeInsert = mock(async () => {});
    const onInsertRollback = mock(() => {});
    const job = createAtomicTestJob({ type: "type:a" });

    try {
      const decision = await committingRepository.enqueueAtomic({
        jobData: job,
        strategy: "skip",
        beforeInsert,
        onInsertRollback,
      });

      expect(decision).toEqual({ kind: "inserted", jobId: job.id });
      expect(commitState.commitCalls).toBe(3);
      expect(transaction).toHaveBeenCalledTimes(3);
      expect(beforeInsert).toHaveBeenCalledTimes(3);
      expect(onInsertRollback).toHaveBeenCalledTimes(2);
      expect((await committingRepository.getStatus(job.id))?.status).toBe(
        JOB_STATUS.PENDING,
      );
    } finally {
      database.client.close();
    }
  });

  it("releases insert preparation when replay resolves to a duplicate", async () => {
    const database = createJobQueueDatabase(config);
    const commitState: CommitConflictState = {
      commitCalls: 0,
      remainingFailures: 1,
    };
    const duplicate = createTestJob({
      id: "competing-job",
      type: "type:a",
      metadata: {
        operationType: "data_processing",
        rootJobId: "competing-job",
        deduplicationKey: "retry-key",
      },
    });
    let transactionCalls = 0;
    const transactionClient: JobQueueWriteTransactionClient = {
      transaction: async (mode) => {
        transactionCalls++;
        if (transactionCalls === 2) {
          await committingRepository.insert(duplicate);
        }
        return new CommitConflictTransaction(
          await database.client.transaction(mode),
          commitState,
        );
      },
    };
    const committingRepository = new JobQueueRepository(
      database.db,
      transactionClient,
      `${database.url}:commit-retry-to-skip-test`,
      createSilentLogger(),
    );
    const beforeInsert = mock(async () => {});
    const onInsertRollback = mock(() => {});
    const job = createAtomicTestJob({
      type: "type:a",
      metadata: {
        operationType: "data_processing",
        rootJobId: "retrying-job",
        deduplicationKey: "retry-key",
      },
    });

    try {
      const decision = await committingRepository.enqueueAtomic({
        jobData: job,
        strategy: "skip",
        deduplicationKey: "retry-key",
        beforeInsert,
        onInsertRollback,
      });

      expect(decision).toEqual({
        kind: "skipped",
        jobId: duplicate.id,
      });
      expect(beforeInsert).toHaveBeenCalledTimes(1);
      expect(onInsertRollback).toHaveBeenCalledTimes(1);
      expect(await committingRepository.getStatus(job.id)).toBeNull();
      expect((await committingRepository.getStatus(duplicate.id))?.status).toBe(
        JOB_STATUS.PENDING,
      );
    } finally {
      database.client.close();
    }
  });

  it("outlasts commit contention beyond any fixed attempt cap", async () => {
    const database = createJobQueueDatabase(config);
    const commitState: CommitConflictState = {
      commitCalls: 0,
      remainingFailures: 8,
    };
    const transactionClient: JobQueueWriteTransactionClient = {
      transaction: async (mode) =>
        new CommitConflictTransaction(
          await database.client.transaction(mode),
          commitState,
        ),
    };
    const committingRepository = new JobQueueRepository(
      database.db,
      transactionClient,
      `${database.url}:commit-contention-test`,
      createSilentLogger(),
    );
    const beforeInsert = mock(async () => {});
    const onInsertRollback = mock(() => {});
    const job = createAtomicTestJob({ type: "type:a" });

    try {
      const decision = await committingRepository.enqueueAtomic({
        jobData: job,
        strategy: "skip",
        beforeInsert,
        onInsertRollback,
      });

      expect(decision).toEqual({ kind: "inserted", jobId: job.id });
      expect(commitState.commitCalls).toBe(9);
      expect(beforeInsert).toHaveBeenCalledTimes(9);
      expect(onInsertRollback).toHaveBeenCalledTimes(8);
    } finally {
      database.client.close();
    }
  });

  it("rolls back every replayed insertion after commit conflict exhaustion", async () => {
    const database = createJobQueueDatabase(config);
    const commitState: CommitConflictState = {
      commitCalls: 0,
      remainingFailures: Number.POSITIVE_INFINITY,
    };
    const transactionClient: JobQueueWriteTransactionClient = {
      transaction: async (mode) =>
        new CommitConflictTransaction(
          await database.client.transaction(mode),
          commitState,
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
    const onInsertRollback = mock(() => {});
    const job = createAtomicTestJob({ type: "type:a" });

    try {
      void expect(
        committingRepository.enqueueAtomic({
          jobData: job,
          strategy: "skip",
          beforeInsert,
          onInsertRollback,
        }),
      ).rejects.toThrow(
        /Failed to commit atomic enqueue transaction for type "type:a" within \d+ms/,
      );
      expect(beforeInsert.mock.calls.length).toBeGreaterThan(1);
      expect(onInsertRollback).toHaveBeenCalledTimes(
        beforeInsert.mock.calls.length,
      );
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

  it("returns recent jobs of every status for a type, newest first, bounded", async () => {
    await repository.insert(
      createTestJob({
        id: "job-old-success",
        type: "site-builder:site-build",
        status: JOB_STATUS.COMPLETED,
        createdAt: 1_000,
        completedAt: 2_000,
      }),
    );
    await repository.insert(
      createTestJob({
        id: "job-failed",
        type: "site-builder:site-build",
        status: JOB_STATUS.FAILED,
        createdAt: 3_000,
        completedAt: 4_000,
      }),
    );
    await repository.insert(
      createTestJob({
        id: "job-pending",
        type: "site-builder:site-build",
        status: JOB_STATUS.PENDING,
        createdAt: 5_000,
      }),
    );
    await repository.insert(
      createTestJob({
        id: "job-other-type",
        type: "test:job",
        createdAt: 6_000,
      }),
    );

    const recent = await repository.getRecentJobs(
      ["site-builder:site-build"],
      2,
    );

    expect(recent.map((job) => job.id)).toEqual(["job-pending", "job-failed"]);
  });

  it("retires only an exact unowned active job", async () => {
    const job = createTestJob({
      id: "legacy-skill-projection",
      type: "skill:project",
      status: JOB_STATUS.PROCESSING,
      startedAt: 1_100,
    });
    await repository.insert(job);

    const retired = await repository.retireUnownedActiveJob({
      jobId: job.id,
      expectedType: "skill:project",
      reason:
        "Retired legacy projection job superseded by scheduler-owned projections",
      now: 20_000,
    });

    expect(retired).toMatchObject({
      id: job.id,
      type: "skill:project",
      status: JOB_STATUS.FAILED,
      retryCount: 0,
      completedAt: 20_000,
      runtimeUpdatedAt: 20_000,
      lastError:
        "Retired legacy projection job superseded by scheduler-owned projections",
      attemptId: null,
      workerSlotId: null,
      workerSessionId: null,
      leaseExpiresAt: null,
      attemptHeartbeatAt: null,
      progress: null,
    });
  });

  it("refuses to retire owned or partially progressed work", async () => {
    const owned = createTestJob({ id: "owned", type: "skill:project" });
    await repository.insert(owned);
    await repository.startWorkerSession("worker-a", "session-a", 10_000);
    await repository.claimNextReady(
      claimOptions({ executableTypes: ["skill:project"] }),
    );

    const progressed = createTestJob({
      id: "progressed",
      type: "skill:project",
      status: JOB_STATUS.PROCESSING,
      startedAt: 1_100,
      progress: { progress: 1, total: 2, message: "Partial" },
    });
    await repository.insert(progressed);

    expect(
      await repository.retireUnownedActiveJob({
        jobId: owned.id,
        expectedType: "skill:project",
        reason: "retired",
        now: 20_000,
      }),
    ).toBeNull();
    expect(
      await repository.retireUnownedActiveJob({
        jobId: progressed.id,
        expectedType: "skill:project",
        reason: "retired",
        now: 20_000,
      }),
    ).toBeNull();
  });

  it("refuses a mismatched type and an already-terminal job", async () => {
    const active = createTestJob({ id: "active", type: "topic:project" });
    const terminal = createTestJob({
      id: "terminal",
      type: "skill:project",
      status: JOB_STATUS.COMPLETED,
      completedAt: 2_000,
    });
    await repository.insert(active);
    await repository.insert(terminal);

    expect(
      await repository.retireUnownedActiveJob({
        jobId: active.id,
        expectedType: "skill:project",
        reason: "retired",
        now: 20_000,
      }),
    ).toBeNull();
    expect(
      await repository.retireUnownedActiveJob({
        jobId: terminal.id,
        expectedType: "skill:project",
        reason: "retired",
        now: 20_000,
      }),
    ).toBeNull();
  });
});
