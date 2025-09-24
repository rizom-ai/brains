// With moduleResolution: "bundler", we can export implementations safely
export { JobQueueService } from "./job-queue-service";
export { JobQueueWorker } from "./job-queue-worker";
export { BatchJobManager } from "./batch-job-manager";
export { JobProgressMonitor } from "./job-progress-monitor";

export type {
  IJobQueueService,
  JobHandler,
  EnqueueJob,
  JobInfo,
  JobQueueDbConfig,
  JobQueueWorkerConfig,
  JobQueueWorkerStats,
  IJobQueueWorker,
  IBatchJobManager,
} from "./types";
export { JobInfoSchema } from "./types";
export {
  JobStatusSchema,
  JobResultSchema,
  JobStatusEnum,
  JobResultStatusEnum,
  JOB_STATUS,
  type JobStatus,
  type JobResult,
  type JobStatusType,
  type JobResultStatusType,
  JobProgressEventSchema,
  type JobProgressEvent,
} from "./schemas";

// Export batch-related types
export type {
  BatchOperation,
  BatchJobStatus,
  Batch,
} from "./batch-schemas";

// Export enums and schemas from pure types file (no Drizzle dependencies)
export {
  OperationTypeEnum,
  JobContextSchema,
} from "./schema/types";

// Export types that external packages need
export type {
  OperationType,
  JobContext,
  JobOptions,
  JobStats,
} from "./schema/types";


// Removed complex progress utilities for simplicity
