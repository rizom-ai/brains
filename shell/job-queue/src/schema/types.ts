import { z } from "@brains/utils/zod";

export type OperationType =
  | "file_operations"
  | "content_operations"
  | "data_processing"
  | "batch_processing";

export interface JobContextInput {
  [key: string]: unknown;
  pluginId?: string | undefined;
  progressToken?: string | number | undefined;
  operationType: OperationType;
  operationTarget?: string | undefined;
  interfaceType?: string | undefined;
  conversationId?: string | undefined;
  channelId?: string | undefined;
  silent?: boolean | undefined;
}

export interface JobContext extends JobContextInput {
  rootJobId: string;
}

/**
 * Operation type enum for structured progress tracking and aggregation
 * Using generic categories to accommodate various plugin operations
 */
export const OperationTypeEnum: z.ZodEnum<{
  file_operations: "file_operations";
  content_operations: "content_operations";
  data_processing: "data_processing";
  batch_processing: "batch_processing";
}> = z.enum([
  "file_operations", // directory sync, file processing, import/export
  "content_operations", // content generation, promotion, rollback, site building
  "data_processing", // entity processing, embedding generation, search indexing
  "batch_processing", // batch operations
]);

/**
 * Job context input schema - what callers provide when creating jobs
 * Note: rootJobId is not included here - it's managed internally by the job queue service
 * and defaults to the job's own ID for standalone jobs, or the batch ID for batch children.
 */
export const JobContextInputSchema: z.ZodType<JobContextInput, unknown> =
  z.object({
    pluginId: z.string().optional(),
    progressToken: z.union([z.string(), z.number()]).optional(),
    operationType: OperationTypeEnum,
    operationTarget: z.string().optional(),
    // Routing context for progress message delivery
    interfaceType: z.string().optional(), // Which interface triggered the job (e.g., "matrix", "cli")
    conversationId: z.string().optional(), // Durable conversation/session to route progress messages to
    channelId: z.string().optional(), // Transport channel/room to route progress messages to
    // Suppress all progress/completion events for this job (e.g. background
    // embedding jobs that would otherwise spam every subscriber)
    silent: z.boolean().optional(),
  });

/**
 * Full job context schema - includes rootJobId for stored/transmitted metadata
 * This is what gets stored in the database and sent in progress events.
 */
export const JobContextSchema: z.ZodType<JobContext, unknown> = z.object({
  pluginId: z.string().optional(),
  progressToken: z.union([z.string(), z.number()]).optional(),
  operationType: OperationTypeEnum,
  operationTarget: z.string().optional(),
  interfaceType: z.string().optional(),
  conversationId: z.string().optional(),
  channelId: z.string().optional(),
  silent: z.boolean().optional(),
  rootJobId: z.string(), // Added by job queue service when job is created
});

/**
 * Deduplication strategy for job queue
 */
export const DeduplicationStrategyEnum: z.ZodEnum<{
  none: "none";
  skip: "skip";
  replace: "replace";
  coalesce: "coalesce";
}> = z.enum([
  "none", // No deduplication (default behavior)
  "skip", // Skip if PENDING job exists (allows queueing if only PROCESSING)
  "replace", // Cancel pending job and create new one
  "coalesce", // Update existing job's timestamp
]);

export type DeduplicationStrategy = z.output<typeof DeduplicationStrategyEnum>;

/**
 * Job options for job creation
 */
export interface JobOptions {
  priority?: number; // Job priority (lower = higher priority, 0 = default)
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
