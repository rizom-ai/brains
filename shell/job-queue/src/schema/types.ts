import { z } from "@brains/utils";

/**
 * Operation type enum for structured progress tracking and aggregation
 * Using generic categories to accommodate various plugin operations
 */
export const OperationTypeEnum = z.enum([
  "file_operations", // directory sync, file processing, import/export
  "content_operations", // content generation, promotion, rollback, site building
  "data_processing", // entity processing, embedding generation, search indexing
  "batch_processing", // batch operations
]);

export type OperationType = z.infer<typeof OperationTypeEnum>;

/**
 * Job context input schema - what callers provide when creating jobs
 * Note: rootJobId is not included here - it's managed internally by the job queue service
 * and defaults to the job's own ID for standalone jobs, or the batch ID for batch children.
 */
export const JobContextInputSchema = z.object({
  pluginId: z.string().optional(),
  progressToken: z.union([z.string(), z.number()]).optional(),
  operationType: OperationTypeEnum,
  operationTarget: z.string().optional(),
});

export type JobContextInput = z.infer<typeof JobContextInputSchema>;

/**
 * Full job context schema - includes rootJobId for stored/transmitted metadata
 * This is what gets stored in the database and sent in progress events.
 */
export const JobContextSchema = JobContextInputSchema.extend({
  rootJobId: z.string(), // Added by job queue service when job is created
});

export type JobContext = z.infer<typeof JobContextSchema>;

/**
 * Deduplication strategy for job queue
 */
export const DeduplicationStrategyEnum = z.enum([
  "none", // No deduplication (default behavior)
  "skip", // Skip if PENDING job exists (allows queueing if only PROCESSING)
  "replace", // Cancel pending job and create new one
  "coalesce", // Update existing job's timestamp
]);

export type DeduplicationStrategy = z.infer<typeof DeduplicationStrategyEnum>;

/**
 * Job options for job creation
 */
export interface JobOptions {
  priority?: number; // Job priority (higher = more important)
  maxRetries?: number; // Override default retry count
  delayMs?: number; // Initial delay before processing
  source: string; // Source identifier for job progress events
  metadata: JobContextInput; // Caller-provided metadata (rootJobId is added by job queue service)
  deduplication?: DeduplicationStrategy; // Deduplication strategy (default: "none")
  deduplicationKey?: string; // Optional key for fine-grained deduplication
  /**
   * Override rootJobId for batch child jobs
   * External callers should not use this - it's set automatically by the job queue service
   * Batch jobs use this to link child jobs to the parent batch
   */
  rootJobId?: string;
}

/**
 * Job statistics
 */
export interface JobStats {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
  total: number;
}
