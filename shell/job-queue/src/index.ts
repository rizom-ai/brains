export { JobQueueService } from "./job-queue-service";
export { JobQueueWorker } from "./job-queue-worker";
export { BatchJobManager } from "./batch-job-manager";
export { JobProgressMonitor } from "./job-progress-monitor";
export type { JobQueueDbConfig } from "./db";
export { migrateJobQueue } from "./migrate";
export type {
  JobQueueWorkerConfig,
  JobQueueWorkerStats,
} from "./job-queue-worker";
export type { IJobQueueService, JobHandler, EnqueueJob } from "./types";
export {
  JobStatusSchema,
  JobResultSchema,
  BatchOperationSchema,
  BatchJobDataSchema,
  BatchJobStatusSchema,
  BatchSchema,
  JobStatusEnum,
  JobResultStatusEnum,
  JOB_STATUS,
  type JobStatus,
  type JobResult,
  type JobStatusType,
  type JobResultStatusType,
  type BatchOperation,
  type BatchJobData,
  type BatchJobStatus,
  type Batch,
  JobProgressEventSchema,
  type JobProgressEvent,
} from "./schemas";

// Export job queue schema and types
export * from "./schema/job-queue";
export { createId } from "./schema/utils";

// Progress utilities (public API for interfaces)
export { type ProgressCalculation } from "./utils/progress-calculations";
export {
  progressReducer,
  createInitialProgressState,
  groupProgressEvents,
  ProgressThrottleManager,
  DEFAULT_THROTTLE_CONFIG,
  type ProgressState,
  type ProgressAction,
  type ProgressEventGroups,
  type ThrottleConfig,
} from "./utils/progress-state-manager";
export {
  formatProgressMessage,
  formatBatchProgressMessage,
  type ProgressMessageData,
} from "./utils/progress-formatting";
