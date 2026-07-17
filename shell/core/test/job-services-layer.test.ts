import { describe, expect, it } from "bun:test";
import type { IJobQueueWorker, JobQueueWorkerStats } from "@brains/job-queue";
import { MessageBus } from "@brains/messaging-service";
import {
  createMockBatchJobManager,
  createMockJobQueueService,
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import type {
  IJobProgressMonitor,
  ProgressReporter,
} from "@brains/utils/progress";
import { initializeJobServices } from "../src/initialization/job-services";
import type { ShellDependencies } from "../src/types/shell-types";

const logger = createSilentLogger("job-services-layer-test");

class TrackingProgressMonitor implements IJobProgressMonitor {
  private readonly order: string[];
  private readonly failure: unknown;

  public constructor(order: string[], failure?: unknown) {
    this.order = order;
    this.failure = failure;
  }

  public start(): void {}

  public stop(): void {
    this.order.push("progress");
    if (this.failure !== undefined) throw this.failure;
  }

  public createProgressReporter(_jobId: string): ProgressReporter {
    return createMockProgressReporter();
  }

  public async emitJobCompletion(_jobId: string): Promise<void> {}

  public async emitJobFailure(_jobId: string): Promise<void> {}

  public async handleJobStatusChange(
    _jobId: string,
    _status: "completed" | "failed",
    _metadata?: Record<string, unknown>,
  ): Promise<void> {}
}

function createInjectedDependencies(options: {
  order: string[];
  workerFailure?: unknown;
  progressFailure?: unknown;
  batchFailure?: unknown;
}): ShellDependencies {
  const { order, workerFailure, progressFailure, batchFailure } = options;

  const jobQueueService = createMockJobQueueService();
  jobQueueService.close = (): void => {
    order.push("database");
  };

  const jobQueueWorker = {
    start: async (): Promise<void> => {},
    stop: async (): Promise<void> => {
      order.push("worker");
      if (workerFailure !== undefined) throw workerFailure;
    },
    getStats: (): JobQueueWorkerStats => ({
      processedJobs: 0,
      failedJobs: 0,
      activeJobs: 0,
      uptime: 0,
      isRunning: false,
    }),
    isWorkerRunning: (): boolean => false,
  } satisfies IJobQueueWorker;

  const batchJobManager = createMockBatchJobManager();
  batchJobManager.stop = async (): Promise<void> => {
    order.push("batch");
    if (batchFailure !== undefined) throw batchFailure;
  };

  return {
    jobQueueService,
    jobQueueWorker,
    jobProgressMonitor: new TrackingProgressMonitor(order, progressFailure),
    batchJobManager,
  };
}

describe("job service layers", () => {
  it("constructs fresh production services without singleton resets", async () => {
    const messageBus = MessageBus.createFresh(logger);
    const first = initializeJobServices({
      dependencies: undefined,
      jobQueueConfig: { url: "file::memory:" },
      messageBus,
      logger,
    });
    const second = initializeJobServices({
      dependencies: undefined,
      jobQueueConfig: { url: "file::memory:" },
      messageBus,
      logger,
    });

    expect(first.jobQueueService).not.toBe(second.jobQueueService);
    expect(first.batchJobManager).not.toBe(second.batchJobManager);
    expect(first.jobProgressMonitor).not.toBe(second.jobProgressMonitor);
    expect(first.jobQueueWorker).not.toBe(second.jobQueueWorker);

    await first.closeRuntime();
    await second.closeRuntime();
    first.closeDatabase();
    second.closeDatabase();
  });

  it("releases all runtime services before the database", async () => {
    const order: string[] = [];
    const services = initializeJobServices({
      dependencies: createInjectedDependencies({ order }),
      jobQueueConfig: { url: "file::memory:" },
      messageBus: MessageBus.createFresh(logger),
      logger,
    });

    await services.closeRuntime();
    services.closeDatabase();

    expect(order).toEqual(["worker", "progress", "batch", "database"]);
  });

  it("can synchronously roll back an unused runtime layer", async () => {
    const order: string[] = [];
    const services = initializeJobServices({
      dependencies: createInjectedDependencies({ order }),
      jobQueueConfig: { url: "file::memory:" },
      messageBus: MessageBus.createFresh(logger),
      logger,
    });

    services.rollbackRuntime();
    await services.closeRuntime();
    services.closeDatabase();

    expect(order).toEqual(["database"]);
  });

  it("settles runtime cleanup and preserves the first failure", async () => {
    const order: string[] = [];
    const workerFailure = new Error("worker stop failed");
    const services = initializeJobServices({
      dependencies: createInjectedDependencies({
        order,
        workerFailure,
        progressFailure: new Error("progress stop failed"),
        batchFailure: new Error("batch stop failed"),
      }),
      jobQueueConfig: { url: "file::memory:" },
      messageBus: MessageBus.createFresh(logger),
      logger,
    });

    let receivedFailure: unknown;
    try {
      await services.closeRuntime();
    } catch (error) {
      receivedFailure = error;
    }
    services.closeDatabase();

    expect(receivedFailure).toBe(workerFailure);
    expect(order).toEqual(["worker", "progress", "batch", "database"]);
  });
});
