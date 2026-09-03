import {
  actorRefSchema,
  OperationProvenanceSchema,
  type ProvenanceEntityReference,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";

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

export type OperationType = z.output<typeof OperationTypeEnum>;

type JobContextInputSchema = z.ZodObject<
  {
    pluginId: z.ZodOptional<z.ZodString>;
    progressToken: z.ZodOptional<
      z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>
    >;
    operationType: typeof OperationTypeEnum;
    operationTarget: z.ZodOptional<z.ZodString>;
    interfaceType: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
    channelId: z.ZodOptional<z.ZodString>;
    requestedByActor: z.ZodOptional<typeof actorRefSchema>;
    requestedByUserId: z.ZodOptional<z.ZodString>;
    requestedByInterface: z.ZodOptional<z.ZodString>;
    silent: z.ZodOptional<z.ZodBoolean>;
    provenance: z.ZodOptional<typeof OperationProvenanceSchema>;
  },
  z.core.$loose
>;

/**
 * Job context input schema - what callers provide when creating jobs
 * Note: rootJobId is not included here - it's managed internally by the job queue service
 * and defaults to the job's own ID for standalone jobs, or the batch ID for batch children.
 *
 * Callers attach further keys of their own; the object is loose so parsing
 * keeps them and the type admits them.
 */
export const JobContextInputSchema: JobContextInputSchema = z.looseObject({
  pluginId: z.string().optional(),
  progressToken: z.union([z.string(), z.number()]).optional(),
  operationType: OperationTypeEnum,
  operationTarget: z.string().optional(),
  // Routing context for progress message delivery
  interfaceType: z.string().optional(), // Which interface triggered the job (e.g., "matrix", "cli")
  conversationId: z.string().optional(), // Durable conversation/session to route progress messages to
  channelId: z.string().optional(), // Transport channel/room to route progress messages to
  requestedByActor: actorRefSchema.optional(),
  requestedByUserId: z.string().optional(),
  requestedByInterface: z.string().optional(),
  // Suppress all progress/completion events for this job (e.g. background
  // embedding jobs that would otherwise spam every subscriber)
  silent: z.boolean().optional(),
  provenance: OperationProvenanceSchema.optional(),
});

export type JobContextInput = z.output<typeof JobContextInputSchema>;

/**
 * Full job context schema - includes rootJobId for stored/transmitted metadata
 * This is what gets stored in the database and sent in progress events.
 */
export const JobContextSchema: z.ZodObject<
  JobContextInputSchema["shape"] & { rootJobId: z.ZodString },
  z.core.$loose
> = z.looseObject({
  pluginId: z.string().optional(),
  progressToken: z.union([z.string(), z.number()]).optional(),
  operationType: OperationTypeEnum,
  operationTarget: z.string().optional(),
  interfaceType: z.string().optional(),
  conversationId: z.string().optional(),
  channelId: z.string().optional(),
  requestedByActor: actorRefSchema.optional(),
  requestedByUserId: z.string().optional(),
  requestedByInterface: z.string().optional(),
  silent: z.boolean().optional(),
  provenance: OperationProvenanceSchema.optional(),
  rootJobId: z.string(), // Added by job queue service when job is created
});

export type JobContext = z.output<typeof JobContextSchema>;

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
export interface ProjectionJobContext {
  id: string;
  sourceEntity?: ProvenanceEntityReference | undefined;
}

export interface JobOptions {
  priority?: number; // Job priority (lower = higher priority, 0 = default)
  maxRetries?: number; // Override default retry count
  delayMs?: number; // Initial delay before processing
  source: string; // Source identifier for job progress events
  metadata: JobContextInput; // Caller-provided metadata (rootJobId is added by job queue service)
  deduplication?: DeduplicationStrategy; // Deduplication strategy (default: "none")
  deduplicationKey?: string; // Optional key for fine-grained deduplication
  /** Projection identity used to advance inherited causal provenance. */
  projection?: ProjectionJobContext;
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
