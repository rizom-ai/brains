import {
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  scopedServiceLayer,
} from "@brains/utils/effect";
import type { MessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils/logger";
import type { IJobProgressMonitor } from "@brains/utils/progress";
import type { OperationContext } from "@brains/operation-context";
import { BatchJobManager } from "./batch-job-manager";
import {
  JobProgressMonitor,
  type JobProgressMonitorMode,
} from "./job-progress-monitor";
import {
  JobQueueService,
  type ProjectionJobAdmission,
} from "./job-queue-service";
import { JobQueueWorker } from "./job-queue-worker";
import type { JobQueueRpcTransport } from "./job-queue-rpc";
import type {
  IBatchJobManager,
  IJobQueueService,
  IJobQueueWorker,
  JobHandlerRegistrationMode,
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
  operationContext?: OperationContext;
  projectionAdmission?: ProjectionJobAdmission;
  handlerRegistrationMode?: JobHandlerRegistrationMode;
  remoteTransport?: JobQueueRpcTransport;
  service?: IJobQueueService;
}

export interface JobQueueRuntimeLayerOptions {
  messageBus: MessageBus;
  logger: Logger;
  batchJobManager?: IBatchJobManager;
  jobProgressMonitor?: IJobProgressMonitor;
  jobQueueWorker?: IJobQueueWorker;
  onWorkerUnhealthy?: (reason: string) => void;
  workerConcurrency: number;
  operationContext?: OperationContext;
  progressMonitorMode?: JobProgressMonitorMode;
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
  return scopedServiceLayer(JobQueueServiceTag, () => {
    const service =
      options.service ??
      JobQueueService.createFresh(options.config, options.logger, {
        ...(options.operationContext && {
          operationContext: options.operationContext,
        }),
        ...(options.projectionAdmission && {
          projectionAdmission: options.projectionAdmission,
        }),
        ...(options.handlerRegistrationMode && {
          handlerRegistrationMode: options.handlerRegistrationMode,
        }),
        ...(options.remoteTransport && {
          remoteTransport: options.remoteTransport,
        }),
      });
    return { service, close: () => service.close() };
  });
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
        options.progressMonitorMode,
      );
    const jobQueueWorker =
      options.jobQueueWorker ??
      JobQueueWorker.createFresh(
        jobQueueService,
        jobProgressMonitor,
        options.logger,
        {
          pollInterval: 100,
          concurrency: options.workerConcurrency,
          autoStart: false,
          ...(options.onWorkerUnhealthy && {
            onUnhealthy: options.onWorkerUnhealthy,
          }),
        },
        {
          ...(options.operationContext && {
            operationContext: options.operationContext,
          }),
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
