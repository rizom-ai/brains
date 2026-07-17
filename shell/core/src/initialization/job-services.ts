import type {
  IBatchJobManager,
  IJobQueueService,
  IJobQueueWorker,
  JobQueueServiceConfig,
} from "@brains/job-queue";
import {
  BatchJobManagerTag,
  JobProgressMonitorTag,
  JobQueueServiceTag,
  JobQueueWorkerTag,
  createJobQueueRuntimeLayer,
  createJobQueueServiceLayer,
  type JobQueueRuntimeLayerHandle,
} from "@brains/job-queue/effect";
import type { MessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils/logger";
import type { IJobProgressMonitor } from "@brains/utils/progress";
import {
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  Scope,
} from "@brains/utils/effect";
import { runEffectPromise } from "../effect-runtime";
import type { ShellDependencies } from "../types/shell-types";

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

function closeScopeSync(scope: Scope.CloseableScope): void {
  const exit = Effect.runSyncExit(Scope.close(scope, Exit.void));
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
}

/**
 * Compose the job-queue package's internal Effect layers with separate runtime
 * and database scopes. Workers drain before plugins stop, while the queue
 * database remains available until dependent shell resources are released.
 */
export function initializeJobServices(options: JobServiceOptions): JobServices {
  const databaseScope = Effect.runSync(Scope.make());
  let runtimeScope: Scope.CloseableScope | undefined;
  let runtimeLayerHandle: JobQueueRuntimeLayerHandle | undefined;

  try {
    const databaseContext = Effect.runSync(
      Layer.buildWithScope(
        createJobQueueServiceLayer({
          config: options.jobQueueConfig,
          logger: options.logger,
          ...(options.dependencies?.jobQueueService && {
            service: options.dependencies.jobQueueService,
          }),
        }),
        databaseScope,
      ),
    );
    const jobQueueService = Context.get(databaseContext, JobQueueServiceTag);

    const acquiredRuntimeScope = Effect.runSync(Scope.make());
    runtimeScope = acquiredRuntimeScope;
    const acquiredRuntimeLayerHandle = createJobQueueRuntimeLayer({
      messageBus: options.messageBus,
      logger: options.logger,
      ...(options.dependencies?.batchJobManager && {
        batchJobManager: options.dependencies.batchJobManager,
      }),
      ...(options.dependencies?.jobProgressMonitor && {
        jobProgressMonitor: options.dependencies.jobProgressMonitor,
      }),
      ...(options.dependencies?.jobQueueWorker && {
        jobQueueWorker: options.dependencies.jobQueueWorker,
      }),
    });
    runtimeLayerHandle = acquiredRuntimeLayerHandle;
    const runtimeContext = Effect.runSync(
      Layer.buildWithScope(
        acquiredRuntimeLayerHandle.layer.pipe(
          Layer.provide(Layer.succeed(JobQueueServiceTag, jobQueueService)),
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
        acquiredRuntimeLayerHandle.abandon();
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
        runtimeLayerHandle?.abandon();
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
