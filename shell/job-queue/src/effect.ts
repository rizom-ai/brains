import { Cause, Context, Effect, Exit, Layer } from "@brains/utils/effect";
import type { MessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils/logger";
import type { IJobProgressMonitor } from "@brains/utils/progress";
import { BatchJobManager } from "./batch-job-manager";
import { JobProgressMonitor } from "./job-progress-monitor";
import { JobQueueService } from "./job-queue-service";
import { JobQueueWorker } from "./job-queue-worker";
import type {
  IBatchJobManager,
  IJobQueueService,
  IJobQueueWorker,
  JobQueueServiceConfig,
} from "./types";

export type JobQueueServiceTag = "@brains/job-queue/JobQueueService";
export const JobQueueServiceTag: Context.Tag<
  JobQueueServiceTag,
  IJobQueueService
> = Context.GenericTag<JobQueueServiceTag, IJobQueueService>(
  "@brains/job-queue/JobQueueService",
);

export type BatchJobManagerTag = "@brains/job-queue/BatchJobManager";
export const BatchJobManagerTag: Context.Tag<
  BatchJobManagerTag,
  IBatchJobManager
> = Context.GenericTag<BatchJobManagerTag, IBatchJobManager>(
  "@brains/job-queue/BatchJobManager",
);

export type JobProgressMonitorTag = "@brains/job-queue/JobProgressMonitor";
export const JobProgressMonitorTag: Context.Tag<
  JobProgressMonitorTag,
  IJobProgressMonitor
> = Context.GenericTag<JobProgressMonitorTag, IJobProgressMonitor>(
  "@brains/job-queue/JobProgressMonitor",
);

export type JobQueueWorkerTag = "@brains/job-queue/JobQueueWorker";
export const JobQueueWorkerTag: Context.Tag<
  JobQueueWorkerTag,
  IJobQueueWorker
> = Context.GenericTag<JobQueueWorkerTag, IJobQueueWorker>(
  "@brains/job-queue/JobQueueWorker",
);

export type JobQueueRuntimeContext =
  BatchJobManagerTag | JobProgressMonitorTag | JobQueueWorkerTag;

export interface JobQueueServiceLayerOptions {
  config: JobQueueServiceConfig;
  logger: Logger;
  service?: IJobQueueService;
}

export interface JobQueueRuntimeLayerOptions {
  messageBus: MessageBus;
  logger: Logger;
  batchJobManager?: IBatchJobManager;
  jobProgressMonitor?: IJobProgressMonitor;
  jobQueueWorker?: IJobQueueWorker;
}

export interface JobQueueRuntimeLayerHandle {
  layer: Layer.Layer<JobQueueRuntimeContext, never, JobQueueServiceTag>;
  /** Skip async release when a synchronously constructed shell never starts. */
  abandon(): void;
}

/** Own the queue database for the lifetime of the layer scope. */
export function createJobQueueServiceLayer(
  options: JobQueueServiceLayerOptions,
): Layer.Layer<JobQueueServiceTag> {
  return Layer.scoped(
    JobQueueServiceTag,
    Effect.acquireRelease(
      Effect.sync(
        () =>
          options.service ??
          JobQueueService.createFresh(options.config, options.logger),
      ),
      (jobQueueService) =>
        Effect.sync(() => {
          jobQueueService.close();
        }),
    ),
  );
}

/**
 * Own the worker-side job runtime while requiring a queue service from the
 * surrounding Effect environment. This lets callers compose the runtime with
 * either the live queue layer or an injected test layer.
 */
export function createJobQueueRuntimeLayer(
  options: JobQueueRuntimeLayerOptions,
): JobQueueRuntimeLayerHandle {
  let skipRelease = false;

  const acquire = Effect.gen(function* () {
    const jobQueueService = yield* JobQueueServiceTag;
    const batchJobManager =
      options.batchJobManager ??
      BatchJobManager.createFresh(jobQueueService, options.logger);
    const jobProgressMonitor =
      options.jobProgressMonitor ??
      JobProgressMonitor.createFresh(
        jobQueueService,
        options.messageBus,
        batchJobManager,
        options.logger,
      );
    const jobQueueWorker =
      options.jobQueueWorker ??
      JobQueueWorker.createFresh(
        jobQueueService,
        jobProgressMonitor,
        options.logger,
        {
          pollInterval: 100,
          concurrency: 1,
          autoStart: false,
        },
      );

    return Context.make(BatchJobManagerTag, batchJobManager).pipe(
      Context.add(JobProgressMonitorTag, jobProgressMonitor),
      Context.add(JobQueueWorkerTag, jobQueueWorker),
    );
  });

  return {
    layer: Layer.scopedContext(
      Effect.acquireRelease(acquire, (context) =>
        skipRelease ? Effect.void : releaseJobQueueRuntime(context),
      ),
    ),
    abandon: (): void => {
      skipRelease = true;
    },
  };
}

function releaseJobQueueRuntime(
  context: Context.Context<JobQueueRuntimeContext>,
): Effect.Effect<void> {
  const jobQueueWorker = Context.get(context, JobQueueWorkerTag);
  const jobProgressMonitor = Context.get(context, JobProgressMonitorTag);
  const batchJobManager = Context.get(context, BatchJobManagerTag);

  return Effect.gen(function* () {
    const workerExit = yield* Effect.exit(
      Effect.tryPromise({
        try: () => jobQueueWorker.stop(),
        catch: (error) => error,
      }),
    );
    const progressExit = yield* Effect.exit(
      Effect.try({
        try: () => jobProgressMonitor.stop(),
        catch: (error) => error,
      }),
    );
    const batchExit = yield* Effect.exit(
      Effect.tryPromise({
        try: async () => {
          await batchJobManager.stop();
        },
        catch: (error) => error,
      }),
    );

    const firstFailure = [workerExit, progressExit, batchExit].find(
      Exit.isFailure,
    );
    if (firstFailure) yield* Effect.die(Cause.squash(firstFailure.cause));
  });
}
