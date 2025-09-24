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
 * Job context schema - metadata for job progress tracking and inheritance
 */
export const JobContextSchema = z.object({
  pluginId: z.string().optional(),
  rootJobId: z.string(), // For flattened job inheritance tracking (required for all operations)
  progressToken: z.union([z.string(), z.number()]).optional(),
  operationType: OperationTypeEnum,
  operationTarget: z.string().optional(),
});

export type JobContext = z.infer<typeof JobContextSchema>;

/**
 * Job options for job creation
 */
export interface JobOptions {
  priority?: number; // Job priority (higher = more important)
  maxRetries?: number; // Override default retry count
  delayMs?: number; // Initial delay before processing
  source: string; // Source identifier for job progress events
  metadata: JobContext; // Additional metadata for job progress events (required)
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