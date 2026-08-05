import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createId } from "@brains/utils/id";
import { createJobQueueDatabase } from "../src/db";
import {
  JobQueueRepository,
  type JobAttemptClaim,
} from "../src/job-queue-repository";
import { JOB_STATUS } from "../src/schemas";
import type { InsertJobQueue } from "../src/schema/job-queue";
import type { JobQueueDbConfig } from "../src/types";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";
import type { Client } from "@libsql/client";

type TestInsertJob = Omit<InsertJobQueue, "id"> & { id: string };

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

function claimOptions(
  overrides: Partial<JobAttemptClaim> = {},
): JobAttemptClaim {
  return {
    now: 10_000,
    attemptId: createId(),
    workerSlotId: "worker-a",
    workerSessionId: "session-a",
    leaseDurationMs: 1_000,
    workerSessionTimeoutMs: 2_000,
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
      repository: new JobQueueRepository(database.db, createSilentLogger()),
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
    await repository.startWorkerSession("worker-a", "session-a", 10_000);
    await repository.claimNextReady(claimOptions({ leaseDurationMs: 100 }));

    await repository.startWorkerSession("worker-b", "session-b", 10_200);
    const reclaimed = await repository.claimNextReady(
      claimOptions({
        now: 10_200,
        attemptId: createId(),
        workerSlotId: "worker-b",
        workerSessionId: "session-b",
        workerSessionTimeoutMs: 500,
      }),
    );

    expect(reclaimed).toBeNull();
  });

  it("reclaims another slot's attempt only after both its lease and owner session expire", async () => {
    const job = createTestJob();
    await repository.insert(job);
    await repository.startWorkerSession("worker-a", "session-a", 10_000);
    await repository.claimNextReady(claimOptions({ leaseDurationMs: 100 }));
    await repository.startWorkerSession("worker-b", "session-b", 10_700);

    const reclaimed = await repository.claimNextReady(
      claimOptions({
        now: 10_700,
        attemptId: createId(),
        workerSlotId: "worker-b",
        workerSessionId: "session-b",
        workerSessionTimeoutMs: 500,
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
    await repository.startWorkerSession("worker-a", "session-a", 10_000);
    await repository.claimNextReady(claim);

    expect(
      await repository.heartbeatWorkerSession("worker-a", "session-a", 10_400),
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
        workerSessionTimeoutMs: 500,
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
      scheduledFor: 20_000,
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
      oldestProcessingAgeMs: 2_000,
      staleLeaseCount: 1,
    });
    expect(diagnostics.byType).toEqual(
      expect.arrayContaining([
        { type: "type:a", status: JOB_STATUS.PENDING, count: 1 },
        { type: "type:a", status: JOB_STATUS.COMPLETED, count: 1 },
        { type: "type:b", status: JOB_STATUS.PROCESSING, count: 1 },
      ]),
    );
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
