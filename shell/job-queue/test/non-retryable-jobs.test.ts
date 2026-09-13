import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createMockProgressReporter,
  createSilentLogger,
  waitUntil,
} from "@brains/test-utils";
import type { IJobProgressMonitor } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { NonRetryableJobError } from "../src/errors";
import { JobQueueService } from "../src/job-queue-service";
import { JobQueueWorker } from "../src/job-queue-worker";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";

const inputSchema = z.object({});
const monitor: IJobProgressMonitor = {
  start: () => {},
  stop: () => {},
  createProgressReporter: () => createMockProgressReporter(),
  emitJobCompletion: async () => {},
  emitJobFailure: async () => {},
  handleJobStatusChange: async () => {},
};

describe("non-retryable queue failures (real SQLite)", () => {
  let database: Awaited<ReturnType<typeof createTestJobQueueDatabase>>;
  let service: JobQueueService;
  let worker: JobQueueWorker | undefined;
  const logger = createSilentLogger();
  const process = mock(async (): Promise<void> => {});
  const terminal = mock(async (_error: Error): Promise<void> => {});

  beforeEach(async () => {
    database = await createTestJobQueueDatabase();
    service = JobQueueService.createFresh(database.config, logger);
    process.mockReset();
    terminal.mockReset();
    service.registerHandler("test:failure", {
      validateAndParse: (data) => {
        const parsed = inputSchema.safeParse(data);
        return parsed.success ? parsed.data : null;
      },
      process,
      onTerminalError: terminal,
    });
  });
  afterEach(async () => {
    await worker?.stop();
    worker = undefined;
    service.close();
    await database.cleanup();
  });

  async function enqueue(): Promise<string> {
    return service.enqueue({
      type: "test:failure",
      data: {},
      options: {
        source: "test",
        maxRetries: 3,
        metadata: { operationType: "data_processing" },
      },
    });
  }

  test("worker persists immediate terminal failure, invokes its callback, and survives reopen", async () => {
    const error = new NonRetryableJobError("Invalid output", {
      cause: new Error("schema"),
    });
    process.mockRejectedValue(error);
    const id = await enqueue();
    worker = JobQueueWorker.createFresh(service, monitor, logger, {
      pollInterval: 10,
    });
    await worker.start();
    await waitUntil(
      () => worker?.getStats().failedJobs === 1,
      "the worker's terminal failure",
    );
    await worker.stop();
    expect(process).toHaveBeenCalledTimes(1);
    expect(terminal).toHaveBeenCalledTimes(1);
    expect(terminal.mock.calls[0]?.[0]).toBe(error);
    expect(await service.getStatus(id)).toMatchObject({
      status: "failed",
      retryCount: 0,
      maxRetries: 3,
      lastError: "Invalid output",
      attemptId: null,
    });
    service.close();
    service = JobQueueService.createFresh(database.config, logger);
    expect(await service.getStatus(id)).toMatchObject({
      status: "failed",
      retryCount: 0,
    });
  });

  test("ordinary provider failures still use the retry budget", async () => {
    process.mockRejectedValue(new Error("Provider temporarily unavailable"));
    const id = await enqueue();
    worker = JobQueueWorker.createFresh(service, monitor, logger, {
      pollInterval: 10,
    });
    await worker.start();
    await waitUntil(
      () => worker?.getStats().failedJobs === 1,
      "the worker's retry decision",
    );
    await worker.stop();
    expect(terminal).not.toHaveBeenCalled();
    expect(await service.getStatus(id)).toMatchObject({
      status: "pending",
      retryCount: 1,
      completedAt: null,
    });
  });

  test("a terminal error cannot bypass attempt fencing", async () => {
    const id = await enqueue();
    const claim = await service.dequeue();
    if (!claim?.attemptId) throw new Error("Missing claim");
    const error = new NonRetryableJobError("Conflict");
    expect(await service.fail(id, error, "stale-attempt")).toBe(false);
    expect(await service.getStatus(id)).toMatchObject({
      status: "processing",
      attemptId: claim.attemptId,
    });
    expect(await service.fail(id, error, claim.attemptId)).toBe(true);
    expect(await service.getStatus(id)).toMatchObject({
      status: "failed",
      retryCount: 0,
    });
    expect(await service.complete(id, "stale success", claim.attemptId)).toBe(
      false,
    );
  });
});
