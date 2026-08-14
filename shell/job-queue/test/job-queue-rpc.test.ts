import { afterEach, describe, expect, it } from "bun:test";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { JobQueueService } from "../src/job-queue-service";
import type {
  JobQueueRpcRequest,
  JobQueueRpcTransport,
} from "../src/job-queue-rpc";
import type { JobHandler } from "../src/types";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";

class DirectJsonTransport implements JobQueueRpcTransport {
  public initialized = false;
  public closed = false;
  private readonly owner: JobQueueService;

  public constructor(owner: JobQueueService) {
    this.owner = owner;
  }

  public async initialize(): Promise<void> {
    this.initialized = true;
  }

  public async request(payload: JobQueueRpcRequest): Promise<unknown> {
    const decoded = JSON.parse(JSON.stringify(payload)) as unknown;
    const result = await this.owner.handleRpcRequest(decoded);
    return result === undefined
      ? undefined
      : (JSON.parse(JSON.stringify(result)) as unknown);
  }

  public close(): void {
    this.closed = true;
  }
}

class TestHandler implements JobHandler<"test:remote"> {
  public async process(
    _data: { value: number },
    _jobId: string,
    _progress: ProgressReporter,
  ): Promise<void> {}

  public validateAndParse(data: unknown): { value: number } | null {
    const result = z.object({ value: z.number() }).safeParse(data);
    return result.success ? result.data : null;
  }
}

const services: JobQueueService[] = [];
const cleanups: Array<() => Promise<void>> = [];

async function expectFileMissing(path: string): Promise<void> {
  const error = await access(path).then<never, Error>(
    () => {
      throw new Error(`Expected ${path} not to exist`);
    },
    (reason) => reason as Error,
  );
  expect(error).toMatchObject({ code: "ENOENT" });
}

afterEach(async () => {
  for (const service of services.splice(0)) service.close();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe("job queue owner RPC", () => {
  it("routes durable worker operations without opening a worker database", async () => {
    const testDatabase = await createTestJobQueueDatabase();
    cleanups.push(testDatabase.cleanup);
    const logger = createSilentLogger();
    const owner = JobQueueService.createFresh(testDatabase.config, logger, {
      handlerRegistrationMode: "validation-only",
    });
    const transport = new DirectJsonTransport(owner);
    const workerDatabasePath = join(dirname(testDatabase.dbPath), "worker.db");
    const worker = JobQueueService.createFresh(
      { url: `file:${workerDatabasePath}` },
      logger,
      {
        handlerRegistrationMode: "execution-only",
        remoteTransport: transport,
      },
    );
    services.push(worker, owner);

    const handler = new TestHandler();
    owner.registerHandler("test:remote", handler);
    worker.registerHandler("test:remote", handler);
    await owner.initialize();
    await worker.initialize();

    expect(transport.initialized).toBe(true);
    await expectFileMissing(workerDatabasePath);

    const stableRequest = {
      type: "test:remote",
      data: { value: 7 },
      idempotencyKey: "remote-stable-job",
      options: {
        source: "test",
        metadata: {
          operationType: "data_processing" as const,
          custom: "preserved",
        },
      },
    };
    const jobId = await worker.enqueue(stableRequest);
    expect(jobId).toBe("remote-stable-job");
    const claim = {
      workerSlotId: "slot-1",
      workerSessionId: "session-1",
      leaseDurationMs: 30_000,
    };
    const sessionStartedAt = Date.now();
    await worker.startWorkerSession(
      claim.workerSlotId,
      claim.workerSessionId,
      60_000,
    );
    expect(
      await worker.getDiagnostics(sessionStartedAt + 30_000),
    ).toMatchObject({
      duePending: 1,
      oldestDuePendingAgeMs: expect.any(Number),
      workerSessions: { active: 1, stale: 0 },
    });
    expect(
      await worker.heartbeatWorkerSession(
        claim.workerSlotId,
        claim.workerSessionId,
        120_000,
      ),
    ).toBe(true);
    expect(
      await worker.getDiagnostics(sessionStartedAt + 90_000),
    ).toMatchObject({ workerSessions: { active: 1, stale: 0 } });
    const job = await worker.dequeue(claim);

    expect(job).toMatchObject({
      id: jobId,
      type: "test:remote",
      status: "processing",
      metadata: { custom: "preserved" },
    });
    expect(job?.attemptId).toBeString();
    if (!job?.attemptId) throw new Error("Expected a claimed attempt");

    expect(
      await worker.recordAttemptProgress(jobId, job.attemptId, {
        progress: 1,
        total: 2,
        message: "halfway",
      }),
    ).toBe(true);
    expect(await worker.complete(jobId, { ok: true }, job.attemptId)).toBe(
      true,
    );

    expect(await worker.getStatus(jobId)).toMatchObject({
      status: "completed",
      result: { ok: true },
      progress: { progress: 1, total: 2, message: "halfway" },
    });
    expect(await worker.enqueue(stableRequest)).toBe(jobId);
    expect((await worker.getStats()).total).toBe(1);

    const noResultJobId = await worker.enqueue({
      type: "test:remote",
      data: { value: 8 },
      options: {
        source: "test",
        metadata: { operationType: "data_processing" },
      },
    });
    const noResultJob = await worker.dequeue(claim);
    if (!noResultJob?.attemptId) throw new Error("Expected a claimed attempt");
    expect(
      await worker.complete(noResultJobId, undefined, noResultJob.attemptId),
    ).toBe(true);

    expect(await worker.getStats()).toMatchObject({ completed: 2, total: 2 });
    expect(await worker.getActiveJobs()).toEqual([]);
    expect(await worker.getFailedJobs()).toEqual([]);
    await expectFileMissing(workerDatabasePath);
  });

  it("rejects malformed operations before owner dispatch", async () => {
    const testDatabase = await createTestJobQueueDatabase();
    cleanups.push(testDatabase.cleanup);
    const owner = JobQueueService.createFresh(
      testDatabase.config,
      createSilentLogger(),
    );
    services.push(owner);
    await owner.initialize();

    expect(() =>
      owner.handleRpcRequest({ operation: "cleanup", olderThanMs: -1 }),
    ).toThrow();
  });
});
