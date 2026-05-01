import {
  BatchJobManager,
  JobProgressMonitor,
  JobQueueWorker,
  type IBatchJobManager,
  type IJobQueueService,
  type IJobQueueWorker,
} from "@brains/job-queue";
import type { MessageBus } from "@brains/messaging-service";
import type { IJobProgressMonitor, Logger } from "@brains/utils";
import type { ShellDependencies } from "../types/shell-types";

export interface JobServices {
  batchJobManager: IBatchJobManager;
  jobProgressMonitor: IJobProgressMonitor;
  jobQueueWorker: IJobQueueWorker;
}

export interface JobServiceOptions {
  dependencies: ShellDependencies | undefined;
  jobQueueService: IJobQueueService;
  messageBus: MessageBus;
  logger: Logger;
}

export function initializeJobServices(options: JobServiceOptions): JobServices {
  const { dependencies, jobQueueService, messageBus, logger } = options;

  const batchJobManager =
    dependencies?.batchJobManager ??
    BatchJobManager.getInstance(jobQueueService, logger);
  const jobProgressMonitor =
    dependencies?.jobProgressMonitor ??
    JobProgressMonitor.getInstance(
      jobQueueService,
      messageBus,
      batchJobManager,
      logger,
    );

  const jobQueueWorker =
    dependencies?.jobQueueWorker ??
    JobQueueWorker.getInstance(jobQueueService, jobProgressMonitor, logger, {
      pollInterval: 100,
      concurrency: 1,
      autoStart: false,
    });

  return { batchJobManager, jobProgressMonitor, jobQueueWorker };
}
