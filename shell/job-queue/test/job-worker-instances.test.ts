import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createId } from "@brains/utils/id";
import type { Client } from "@libsql/client";
import { createJobQueueDatabase } from "../src/db";
import {
  JobQueueRepository,
  type AtomicJobData,
  type JobAttemptClaim,
} from "../src/job-queue-repository";
import { JOB_STATUS } from "../src/schemas";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";

const VERSION = "0.2.0-alpha.624";
const NOW = 100_000;
const SESSION_TIMEOUT_MS = 15_000;

function job(overrides: Partial<AtomicJobData> = {}): AtomicJobData {
  const id = overrides.id ?? createId();
  return {
    id,
    type: "test:job",
    data: JSON.stringify({ id }),
    status: JOB_STATUS.PENDING,
    priority: 0,
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    createdAt: 1_000,
    scheduledFor: 1_000,
    startedAt: null,
    completedAt: null,
    source: null,
    metadata: { operationType: "data_processing", rootJobId: id },
    result: null,
    brainVersion: VERSION,
    ...overrides,
  };
}

/** One worker process: its own session slot inside a stable slot. */
interface Instance {
  slot: string;
  session: string;
  stableSlot: string | undefined;
}

function instance(stableSlot: string, session: string): Instance {
  return { slot: `${stableSlot}#${session}`, session, stableSlot };
}

const older = instance(`default@${VERSION}`, "older");
const newer = instance(`default@${VERSION}`, "newer");

describe("worker instances of one stable slot", () => {
  let cleanup: () => Promise<void>;
  let client: Client;
  let repository: JobQueueRepository;

  beforeEach(async () => {
    const testDb = await createTestJobQueueDatabase();
    cleanup = testDb.cleanup;
    const database = createJobQueueDatabase(testDb.config);
    client = database.client;
    repository = new JobQueueRepository(
      database.db,
      database.client,
      database.url,
      createSilentLogger(),
    );
  });

  afterEach(async () => {
    client.close();
    await cleanup();
  });

  function register(worker: Instance, now: number): Promise<void> {
    return repository.startWorkerSession(
      worker.slot,
      worker.session,
      now,
      SESSION_TIMEOUT_MS,
      VERSION,
      worker.stableSlot,
    );
  }

  function heartbeat(worker: Instance, now: number): Promise<boolean> {
    return repository.heartbeatWorkerSession(
      worker.slot,
      worker.session,
      now,
      SESSION_TIMEOUT_MS,
    );
  }

  function claim(
    worker: Instance,
    now: number,
    overrides: Partial<JobAttemptClaim> = {},
  ): ReturnType<JobQueueRepository["claimNextReady"]> {
    return repository.claimNextReady({
      now,
      attemptId: createId(),
      workerSlotId: worker.slot,
      workerSessionId: worker.session,
      leaseDurationMs: 1_000,
      executableTypes: ["test:job"],
      brainVersion: VERSION,
      ...overrides,
    });
  }

  async function enqueue(data: AtomicJobData = job()): Promise<string> {
    await repository.enqueueAtomic({ jobData: data });
    return data.id;
  }

  async function sessionCount(now: number): Promise<number> {
    return (await repository.getDiagnostics(now)).workerSessions.total;
  }

  it("hands new work to the newest live instance only", async () => {
    const jobId = await enqueue();
    await register(older, NOW);
    await register(newer, NOW + 1);

    expect(await claim(older, NOW + 2)).toBeNull();
    expect((await claim(newer, NOW + 2))?.id).toBe(jobId);
  });

  it("keeps the older instance's session and in-flight attempt when a newer instance starts", async () => {
    const jobId = await enqueue();
    await register(older, NOW);
    const inFlight = await claim(older, NOW + 1);
    const attemptId = inFlight?.attemptId ?? "";
    await register(newer, NOW + 2);

    expect(await heartbeat(older, NOW + 3)).toBe(true);
    expect(
      await repository.renewAttemptLease(jobId, attemptId, NOW + 3, 1_000),
    ).toBe(true);
    expect(await claim(newer, NOW + 4)).toBeNull();
    expect(await repository.complete(jobId, { ok: true }, attemptId)).toBe(
      true,
    );
  });

  it("resumes the older instance once the newer instance's session ends", async () => {
    const jobId = await enqueue();
    await register(older, NOW);
    await register(newer, NOW + 1);

    await repository.endWorkerSession(newer.slot, newer.session);
    expect((await claim(older, NOW + 2))?.id).toBe(jobId);
  });

  it("resumes the older instance once the newer instance's session expires", async () => {
    const jobId = await enqueue();
    await register(older, NOW);
    await register(newer, NOW + 1);
    const later = NOW + SESSION_TIMEOUT_MS + 2;
    await heartbeat(older, later);

    expect((await claim(older, later))?.id).toBe(jobId);
  });

  it("lets exactly one of two instances that started in the same millisecond claim", async () => {
    await enqueue();
    await enqueue();
    await register(older, NOW);
    await register(newer, NOW);

    const claims = [await claim(older, NOW + 1), await claim(newer, NOW + 1)];
    expect(claims.filter((claimed) => claimed !== null)).toHaveLength(1);
  });

  it("does not hold back an instance of another stable slot", async () => {
    await enqueue();
    await enqueue();
    const workerA = instance(`worker-a@${VERSION}`, "a");
    const workerB = instance(`worker-b@${VERSION}`, "b");
    await register(workerA, NOW);
    await register(workerB, NOW + 1);

    expect(await claim(workerA, NOW + 2)).not.toBeNull();
    expect(await claim(workerB, NOW + 2)).not.toBeNull();
  });

  it("neither holds back nor is held back by a session without a stable slot", async () => {
    await enqueue();
    await enqueue();
    const direct: Instance = {
      slot: `direct@${VERSION}#d`,
      session: "d",
      stableSlot: undefined,
    };
    await register(older, NOW);
    await register(direct, NOW + 1);
    await register(newer, NOW + 2);

    expect(await claim(direct, NOW + 3)).not.toBeNull();
    expect(await claim(newer, NOW + 3)).not.toBeNull();
  });

  describe("pruning", () => {
    const pastGrace = NOW + 2 * SESSION_TIMEOUT_MS + 1;

    it("removes a session expired past its grace when a live worker heartbeats", async () => {
      await register(older, NOW);
      await register(newer, NOW);
      await heartbeat(newer, NOW + SESSION_TIMEOUT_MS);

      await heartbeat(newer, pastGrace);

      expect(await sessionCount(pastGrace)).toBe(1);
      expect(await heartbeat(older, pastGrace)).toBe(false);
    });

    it("removes a session expired past its grace when another worker starts", async () => {
      await register(older, NOW);

      await register(newer, pastGrace);

      expect(await sessionCount(pastGrace)).toBe(1);
    });

    it("keeps a session that expired within its grace", async () => {
      await register(older, NOW);
      await register(newer, NOW);
      const withinGrace = NOW + SESSION_TIMEOUT_MS + 1;

      await heartbeat(newer, withinGrace);

      expect(await sessionCount(withinGrace)).toBe(2);
    });

    it("keeps an expired session while one of its attempts holds a live lease", async () => {
      const jobId = await enqueue();
      await register(older, NOW);
      await claim(older, NOW, { leaseDurationMs: 10 * SESSION_TIMEOUT_MS });
      await register(newer, pastGrace);

      expect(await sessionCount(pastGrace)).toBe(2);
      expect(await claim(newer, pastGrace)).toBeNull();
      expect((await repository.getStatus(jobId))?.status).toBe(
        JOB_STATUS.PROCESSING,
      );

      const leaseExpired = NOW + 10 * SESSION_TIMEOUT_MS + 1;
      await heartbeat(newer, leaseExpired);
      expect(await sessionCount(leaseExpired)).toBe(1);
    });
  });
});
