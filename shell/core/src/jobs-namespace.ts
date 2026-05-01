import type {
  IBatchJobManager,
  IJobsNamespace,
  IJobQueueService,
} from "@brains/job-queue";

export function createJobsNamespace(
  batchJobManager: IBatchJobManager,
  jobQueueService: IJobQueueService,
): IJobsNamespace {
  return {
    enqueueBatch: batchJobManager.enqueueBatch.bind(batchJobManager),
    getActiveBatches: batchJobManager.getActiveBatches.bind(batchJobManager),
    getBatchStatus: batchJobManager.getBatchStatus.bind(batchJobManager),
    getActiveJobs: jobQueueService.getActiveJobs.bind(jobQueueService),
    getStatus: jobQueueService.getStatus.bind(jobQueueService),
  };
}
