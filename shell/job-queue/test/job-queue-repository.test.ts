import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createId } from "@brains/utils";
import { createJobQueueDatabase } from "../src/db";
import { JobQueueRepository } from "../src/job-queue-repository";
import { JOB_STATUS } from "../src/schemas";
import type { InsertJobQueue } from "../src/schema/job-queue";
import type { JobQueueDbConfig } from "../src/types";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";
import type { Client } from "@libsql/client";

type TestInsertJob = Omit<InsertJobQueue, "id"> & { id: string };

function createTestJob(overrides: Partial<InsertJobQueue> = {}): TestInsertJob {
  const { id: overrideId, ...restOverrides } = overrides;
  const id = overrideId ?? createId();
  const now = 1_000_000;

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

describe("JobQueueRepository", () => {
  let config: JobQueueDbConfig;
  let cleanup: () => Promise<void>;
  let client: Client;
  let repository: JobQueueRepository;

  function createRepository(claimTimeoutMs = 1_000): {
    client: Client;
    repository: JobQueueRepository;
  } {
    const database = createJobQueueDatabase(config);
    return {
      client: database.client,
      repository: new JobQueueRepository(
        database.db,
        createSilentLogger(),
        claimTimeoutMs,
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

  it("reclaims a stuck processing row past the claim timeout", async () => {
    const now = 10_000;
    const job = createTestJob({
      status: JOB_STATUS.PROCESSING,
      startedAt: now - 1_001,
    });
    await repository.insert(job);

    const claimed = await repository.claimNextReady(now);

    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe(JOB_STATUS.PROCESSING);
    expect(claimed?.startedAt).toBe(now);
  });

  it("does not reclaim a processing row before the claim timeout", async () => {
    const now = 10_000;
    const job = createTestJob({
      status: JOB_STATUS.PROCESSING,
      startedAt: now - 999,
    });
    await repository.insert(job);

    const claimed = await repository.claimNextReady(now);

    expect(claimed).toBeNull();
  });

  it("records an expired claim as a retry before reclaiming", async () => {
    const now = 10_000;
    const job = createTestJob({
      status: JOB_STATUS.PROCESSING,
      retryCount: 1,
      startedAt: now - 1_001,
    });
    await repository.insert(job);

    const claimed = await repository.claimNextReady(now);

    expect(claimed?.id).toBe(job.id);
    expect(claimed?.retryCount).toBe(2);
    expect(claimed?.lastError).toBe("Claim expired");
    expect(claimed?.startedAt).toBe(now);
  });

  it("terminally fails an expired claim when reclaim exceeds max retries", async () => {
    const now = 10_000;
    const job = createTestJob({
      status: JOB_STATUS.PROCESSING,
      retryCount: 1,
      maxRetries: 1,
      startedAt: now - 1_001,
    });
    await repository.insert(job);

    const claimed = await repository.claimNextReady(now);
    const stored = await repository.getStatus(job.id);

    expect(claimed).toBeNull();
    expect(stored?.status).toBe(JOB_STATUS.FAILED);
    expect(stored?.retryCount).toBe(2);
    expect(stored?.lastError).toBe("Claim expired");
    expect(stored?.completedAt).toBe(now);
  });

  it("only lets one concurrent caller reclaim an expired processing row", async () => {
    const now = 10_000;
    const job = createTestJob({
      status: JOB_STATUS.PROCESSING,
      startedAt: now - 1_001,
    });
    await repository.insert(job);

    const second = createRepository();
    try {
      const claimedJobs = await Promise.all([
        repository.claimNextReady(now),
        second.repository.claimNextReady(now),
      ]);

      expect(
        claimedJobs.filter((claimed) => claimed?.id === job.id),
      ).toHaveLength(1);
      expect(claimedJobs.filter(Boolean)).toHaveLength(1);
    } finally {
      second.client.close();
    }
  });

  it("orders pending and expired processing candidates by priority then creation time", async () => {
    const now = 10_000;
    const expiredProcessing = createTestJob({
      id: "expired-processing",
      status: JOB_STATUS.PROCESSING,
      createdAt: 100,
      startedAt: now - 1_001,
    });
    const pending = createTestJob({
      id: "pending",
      status: JOB_STATUS.PENDING,
      createdAt: 200,
      scheduledFor: now,
    });
    await repository.insert(expiredProcessing);
    await repository.insert(pending);

    const claimed = await repository.claimNextReady(now);

    expect(claimed?.id).toBe(expiredProcessing.id);
  });
});
