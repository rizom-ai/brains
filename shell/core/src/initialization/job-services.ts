import {
  BatchJobManager,
  JobProgressMonitor,
  JobQueueService,
  JobQueueWorker,
  type IBatchJobManager,
  type IJobQueueService,
  type IJobQueueWorker,
  type JobQueueServiceConfig,
} from "@brains/job-queue";
import type { MessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils/logger";
import type { IJobProgressMonitor } from "@brains/utils/progress";
import { Cause, Context, Effect, Exit, Layer, Scope } from "effect";
import { runEffectPromise } from "../effect-runtime";
import type { ShellDependencies } from "../types/shell-types";

class JobQueueServiceTag extends Context.Tag("@brains/core/JobQueueService")<
  JobQueueServiceTag,
  IJobQueueService
>() {}

class BatchJobManagerTag extends Context.Tag("@brains/core/BatchJobManager")<
  BatchJobManagerTag,
  IBatchJobManager
>() {}

class JobProgressMonitorTag extends Context.Tag(
  "@brains/core/JobProgressMonitor",
)<JobProgressMonitorTag, IJobProgressMonitor>() {}

class JobQueueWorkerTag extends Context.Tag("@brains/core/JobQueueWorker")<
  JobQueueWorkerTag,
  IJobQueueWorker
>() {}

type JobRuntimeContext =
  BatchJobManagerTag | JobProgressMonitorTag | JobQueueWorkerTag;

interface JobRuntimeReleaseState {
  skipRelease: boolean;
}

export interface JobServices {
  batchJobManager: IBatchJobManager;
  jobProgressMonitor: IJobProgressMonitor;
  jobQueueService: IJobQueueService;
  jobQueueWorker: IJobQueueWorker;
  /** Close worker-owned runtime resources before plugin teardown. */
  closeRuntime(): Promise<void>;
  /** Synchronously discard an unused runtime layer during construction rollback. */
  rollbackRuntime(): void;
  /** Close the queue database after all dependent shell resources. */
  closeDatabase(): void;
}

export interface JobServiceOptions {
  dependencies: ShellDependencies | undefined;
  jobQueueConfig: JobQueueServiceConfig;
  messageBus: MessageBus;
  logger: Logger;
}

function createJobQueueLayer(
  options: JobServiceOptions,
): Layer.Layer<JobQueueServiceTag> {
  return Layer.scoped(
    JobQueueServiceTag,
    Effect.acquireRelease(
      Effect.sync(
        () =>
          options.dependencies?.jobQueueService ??
          JobQueueService.createFresh(options.jobQueueConfig, options.logger),
      ),
      (jobQueueService) =>
        Effect.sync(() => {
          jobQueueService.close();
        }),
    ),
  );
}

function createJobRuntimeLayer(
  options: JobServiceOptions,
  jobQueueService: IJobQueueService,
  releaseState: JobRuntimeReleaseState,
): Layer.Layer<JobRuntimeContext> {
  const acquire = Effect.sync(() => {
    const batchJobManager =
      options.dependencies?.batchJobManager ??
      BatchJobManager.createFresh(jobQueueService, options.logger);
    const jobProgressMonitor =
      options.dependencies?.jobProgressMonitor ??
      JobProgressMonitor.createFresh(
        jobQueueService,
        options.messageBus,
        batchJobManager,
        options.logger,
      );
    const jobQueueWorker =
      options.dependencies?.jobQueueWorker ??
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

  return Layer.scopedContext(
    Effect.acquireRelease(acquire, (context) =>
      releaseState.skipRelease ? Effect.void : releaseJobRuntime(context),
    ),
  );
}

function releaseJobRuntime(
  context: Context.Context<JobRuntimeContext>,
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

function closeScopeSync(scope: Scope.CloseableScope): void {
  const exit = Effect.runSyncExit(Scope.close(scope, Exit.void));
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
}

/**
 * Acquire the complete job-service slice with fresh production instances by
 * default. Separate runtime and database scopes preserve shell shutdown order:
 * workers drain before plugins stop, while the queue database remains available
 * until dependent shell resources have been released.
 */
export function initializeJobServices(options: JobServiceOptions): JobServices {
  const databaseScope = Effect.runSync(Scope.make());
  let runtimeScope: Scope.CloseableScope | undefined;
  let runtimeReleaseState: JobRuntimeReleaseState | undefined;

  try {
    const databaseContext = Effect.runSync(
      Layer.buildWithScope(createJobQueueLayer(options), databaseScope),
    );
    const jobQueueService = Context.get(databaseContext, JobQueueServiceTag);

    const acquiredRuntimeScope = Effect.runSync(Scope.make());
    const acquiredRuntimeReleaseState: JobRuntimeReleaseState = {
      skipRelease: false,
    };
    runtimeReleaseState = acquiredRuntimeReleaseState;
    runtimeScope = acquiredRuntimeScope;
    const runtimeContext = Effect.runSync(
      Layer.buildWithScope(
        createJobRuntimeLayer(
          options,
          jobQueueService,
          acquiredRuntimeReleaseState,
        ),
        acquiredRuntimeScope,
      ),
    );

    const batchJobManager = Context.get(runtimeContext, BatchJobManagerTag);
    const jobProgressMonitor = Context.get(
      runtimeContext,
      JobProgressMonitorTag,
    );
    const jobQueueWorker = Context.get(runtimeContext, JobQueueWorkerTag);

    let runtimeClosePromise: Promise<void> | undefined;
    let runtimeClosed = false;
    let databaseClosed = false;

    return {
      batchJobManager,
      jobProgressMonitor,
      jobQueueService,
      jobQueueWorker,
      closeRuntime: (): Promise<void> => {
        runtimeClosed = true;
        runtimeClosePromise ??= runEffectPromise(
          Scope.close(acquiredRuntimeScope, Exit.void),
        );
        return runtimeClosePromise;
      },
      rollbackRuntime: (): void => {
        if (runtimeClosed) return;
        runtimeClosed = true;
        acquiredRuntimeReleaseState.skipRelease = true;
        closeScopeSync(acquiredRuntimeScope);
      },
      closeDatabase: (): void => {
        if (databaseClosed) return;
        databaseClosed = true;
        closeScopeSync(databaseScope);
      },
    };
  } catch (error) {
    if (runtimeScope) {
      try {
        if (runtimeReleaseState) runtimeReleaseState.skipRelease = true;
        closeScopeSync(runtimeScope);
      } catch (cleanupError) {
        options.logger.warn(
          "Failed to release partial job runtime acquisition",
          cleanupError,
        );
      }
    }
    try {
      closeScopeSync(databaseScope);
    } catch (cleanupError) {
      options.logger.warn(
        "Failed to release partial job database acquisition",
        cleanupError,
      );
    }
    throw error;
  }
}
