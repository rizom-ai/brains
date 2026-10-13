import {
  createMockBatchJobManager,
  createMockJobQueueService,
} from "../src/test/index";
import { describe, expect, it, spyOn } from "bun:test";
import { deferred } from "@brains/utils/deferred";
import {
  BatchJobManagerTag,
  JobProgressMonitorTag,
  JobQueueServiceTag,
  JobQueueWorkerTag,
  createJobQueueRuntimeLayer,
  createJobQueueServiceLayer,
} from "@brains/job-queue/effect";
import { MessageBus } from "@brains/messaging-service";
import {
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import type {
  IJobProgressMonitor,
  ProgressReporter,
} from "@brains/utils/progress";
import { Context, Effect, Exit, Layer, Scope } from "@brains/utils/effect";
import type { IJobQueueWorker, JobQueueWorkerStats } from "../src/types";

const logger = createSilentLogger("job-queue-effect-layer-test");

class TrackingProgressMonitor implements IJobProgressMonitor {
  private readonly order: string[];

  public constructor(order: string[]) {
    this.order = order;
  }

  public start(): void {}

  public async stop(): Promise<void> {
    this.order.push("progress");
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

describe("job queue Effect layers", () => {
  it("composes runtime services from an independently scoped queue layer", async () => {
    const order: string[] = [];
    const jobQueueService = createMockJobQueueService();
    jobQueueService.close = (): void => {
      order.push("database");
    };

    const batchJobManager = createMockBatchJobManager();
    batchJobManager.stop = async (): Promise<void> => {
      order.push("batch");
    };

    const jobProgressMonitor = new TrackingProgressMonitor(order);
    const progressStopEntered = deferred();
    const releaseProgressStop = deferred();
    spyOn(jobProgressMonitor, "stop").mockImplementation(async () => {
      progressStopEntered.resolve();
      await releaseProgressStop.promise;
      order.push("progress");
    });
    const jobQueueWorker = {
      start: async (): Promise<void> => {},
      stop: async (): Promise<void> => {
        order.push("worker");
      },
      getStats: (): JobQueueWorkerStats => ({
        processedJobs: 0,
        failedJobs: 0,
        activeJobs: 0,
        uptime: 0,
        isRunning: false,
        isHealthy: true,
      }),
      isWorkerRunning: (): boolean => false,
    } satisfies IJobQueueWorker;

    const databaseScope = Effect.runSync(Scope.make());
    const databaseContext = Effect.runSync(
      Layer.buildWithScope(
        createJobQueueServiceLayer({
          config: { url: "file::memory:" },
          logger,
          service: jobQueueService,
        }),
        databaseScope,
      ),
    );
    const queue = Context.get(databaseContext, JobQueueServiceTag);

    const runtimeScope = Effect.runSync(Scope.make());
    const runtimeLayer = createJobQueueRuntimeLayer({
      messageBus: MessageBus.createFresh(logger),
      logger,
      workerConcurrency: 4,
      batchJobManager,
      jobProgressMonitor,
      jobQueueWorker,
    });
    const runtimeContext = Effect.runSync(
      Layer.buildWithScope(
        runtimeLayer.layer.pipe(
          Layer.provide(Layer.succeed(JobQueueServiceTag, queue)),
        ),
        runtimeScope,
      ),
    );

    expect(Context.get(runtimeContext, BatchJobManagerTag)).toBe(
      batchJobManager,
    );
    expect(Context.get(runtimeContext, JobProgressMonitorTag)).toBe(
      jobProgressMonitor,
    );
    expect(Context.get(runtimeContext, JobQueueWorkerTag)).toBe(jobQueueWorker);

    const closing = Effect.runPromise(Scope.close(runtimeScope, Exit.void));
    await progressStopEntered.promise;
    try {
      expect(order).toEqual(["worker"]);
    } finally {
      releaseProgressStop.resolve();
      await closing;
      Effect.runSync(Scope.close(databaseScope, Exit.void));
    }

    expect(order).toEqual(["worker", "progress", "batch", "database"]);
  });
});
