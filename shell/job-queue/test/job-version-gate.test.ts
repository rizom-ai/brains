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

const OLD = "0.2.0-alpha.612";
const NEW = "0.2.0-alpha.613";
const NOW = 10_000;
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
    ...overrides,
  };
}

interface Worker {
  slot: string;
  session: string;
  version: string | undefined;
}

const oldWorker: Worker = { slot: "old", session: "old-1", version: OLD };
const newWorker: Worker = { slot: "new", session: "new-1", version: NEW };

describe("job queue brain-version gate", () => {
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

  function register(worker: Worker, now = NOW): Promise<void> {
    return repository.startWorkerSession(
      worker.slot,
      worker.session,
      now,
      SESSION_TIMEOUT_MS,
      worker.version,
    );
  }

  function claim(
    worker: Worker,
    overrides: Partial<JobAttemptClaim> = {},
  ): ReturnType<JobQueueRepository["claimNextReady"]> {
    return repository.claimNextReady({
      now: NOW,
      attemptId: createId(),
      workerSlotId: worker.slot,
      workerSessionId: worker.session,
      leaseDurationMs: 1_000,
      executableTypes: ["test:job"],
      brainVersion: worker.version,
      ...overrides,
    });
  }

  async function enqueue(data: AtomicJobData): Promise<void> {
    await repository.enqueueAtomic({ jobData: data });
  }

  it("records the version that queued each job", async () => {
    const queued = job({ brainVersion: NEW });
    await enqueue(queued);

    expect(await repository.getStatus(queued.id)).toMatchObject({
      brainVersion: NEW,
    });
  });

  it("never lets an older worker claim a job a newer brain queued", async () => {
    await enqueue(job({ brainVersion: NEW }));
    await register(oldWorker);

    expect(await claim(oldWorker)).toBeNull();
  });

  it("lets a worker claim jobs its own or an older brain queued", async () => {
    const own = job({ brainVersion: NEW, createdAt: 1_000 });
    const older = job({ brainVersion: OLD, createdAt: 2_000 });
    await enqueue(own);
    await enqueue(older);
    await register(newWorker);

    expect((await claim(newWorker))?.id).toBe(own.id);
    expect((await claim(newWorker))?.id).toBe(older.id);
  });

  it("lets any worker claim a legacy job queued without a version", async () => {
    const legacy = job();
    await enqueue(legacy);
    await register(oldWorker);

    expect((await claim(oldWorker))?.id).toBe(legacy.id);
  });

  it("skips a newer job and claims the next one the worker may run", async () => {
    const newer = job({ brainVersion: NEW, priority: 0 });
    const legacy = job({ priority: 1 });
    await enqueue(newer);
    await enqueue(legacy);
    await register(oldWorker);

    expect((await claim(oldWorker))?.id).toBe(legacy.id);
    expect((await repository.getStatus(newer.id))?.status).toBe(
      JOB_STATUS.PENDING,
    );
  });

  it("stops an older worker claiming any new work once a newer worker registers", async () => {
    const legacy = job();
    const older = job({ brainVersion: OLD });
    await enqueue(legacy);
    await enqueue(older);
    await register(oldWorker);
    await register(newWorker);

    expect(await claim(oldWorker)).toBeNull();
    expect((await claim(newWorker))?.id).toBeDefined();
  });

  it("resumes an older worker once the newer worker's session is gone", async () => {
    const legacy = job();
    await enqueue(legacy);
    await register(oldWorker);
    await register(newWorker);

    await repository.endWorkerSession(newWorker.slot, newWorker.session);
    expect((await claim(oldWorker))?.id).toBe(legacy.id);
  });

  it("ignores an expired newer session", async () => {
    const legacy = job();
    await enqueue(legacy);
    await register(newWorker, NOW - SESSION_TIMEOUT_MS);
    await register(oldWorker);

    expect((await claim(oldWorker))?.id).toBe(legacy.id);
  });

  it("is not stopped by a same-version or unversioned worker", async () => {
    await enqueue(job());
    await enqueue(job());
    await register(oldWorker);
    await register({ slot: "peer", session: "peer-1", version: OLD });
    await register({ slot: "tool", session: "tool-1", version: undefined });

    expect(await claim(oldWorker)).not.toBeNull();
  });

  it("lets an older worker finish its in-flight job after a newer worker registers", async () => {
    const legacy = job();
    await enqueue(legacy);
    await register(oldWorker);
    const inFlight = await claim(oldWorker);
    const attemptId = inFlight?.attemptId ?? "";
    await register(newWorker);

    expect(
      await repository.renewAttemptLease(legacy.id, attemptId, NOW + 1, 1_000),
    ).toBe(true);
    expect(await claim(newWorker, { now: NOW + 2 })).toBeNull();
    expect(await repository.complete(legacy.id, { ok: true }, attemptId)).toBe(
      true,
    );
  });

  it("does not let an older worker recover a newer job's abandoned attempt", async () => {
    const newer = job({ brainVersion: NEW });
    await enqueue(newer);
    await register(newWorker);
    await claim(newWorker, { leaseDurationMs: 100 });
    await repository.endWorkerSession(newWorker.slot, newWorker.session);
    await register(oldWorker, NOW + 200);

    expect(await claim(oldWorker, { now: NOW + 200 })).toBeNull();
  });

  it("lets a newer worker recover an attempt an older worker abandoned", async () => {
    const older = job({ brainVersion: OLD });
    await enqueue(older);
    await register(oldWorker);
    await claim(oldWorker, { leaseDurationMs: 60_000 });
    await repository.endWorkerSession(oldWorker.slot, oldWorker.session);
    await register(newWorker, NOW + 1);

    expect(await claim(newWorker, { now: NOW + 1 })).toMatchObject({
      id: older.id,
      workerSlotId: newWorker.slot,
      retryCount: 1,
    });
  });

  for (const strategy of ["skip", "coalesce"] as const) {
    it(`hands a ${strategy}ped older job to the newer brain that asked for it again`, async () => {
      const older = job({ brainVersion: OLD });
      await repository.enqueueAtomic({ jobData: older, strategy });
      const decision = await repository.enqueueAtomic({
        jobData: job({ brainVersion: NEW }),
        strategy,
      });
      await register(oldWorker);

      expect(decision.jobId).toBe(older.id);
      expect(await repository.getStatus(older.id)).toMatchObject({
        brainVersion: NEW,
      });
      expect(await claim(oldWorker)).toBeNull();
    });

    it(`keeps the newer version when an older brain ${strategy}s into a newer job`, async () => {
      const newer = job({ brainVersion: NEW });
      await repository.enqueueAtomic({ jobData: newer, strategy });
      await repository.enqueueAtomic({
        jobData: job({ brainVersion: OLD }),
        strategy,
      });

      expect(await repository.getStatus(newer.id)).toMatchObject({
        brainVersion: NEW,
      });
    });
  }
});
