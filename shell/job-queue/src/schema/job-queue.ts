import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { createId } from "@brains/utils";

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
 * Generic job queue table for async background processing
 * Supports different job types with discriminated unions
 */
export const jobQueue = sqliteTable(
  "job_queue",
  {
    // Queue item ID (unique job ID)
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),

    // Job type for handler dispatch
    type: text("type").notNull(),

    // Job data (JSON string - type-specific payload)
    data: text("data").notNull(),

    // Job result (JSON - type-specific result after completion)
    result: text("result", { mode: "json" }).$type<unknown>(),

    // Job source (who created this job)
    source: text("source"),

    // Job metadata (additional context for progress events)
    metadata: text("metadata", { mode: "json" }).notNull().$type<JobContext>(),

    // Queue metadata
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    priority: integer("priority").notNull().default(0),
    retryCount: integer("retryCount").notNull().default(0),
    maxRetries: integer("maxRetries").notNull().default(3),
    lastError: text("lastError"),

    // Timestamps
    createdAt: integer("createdAt")
      .notNull()
      .$defaultFn(() => Date.now()),
    scheduledFor: integer("scheduledFor")
      .notNull()
      .$defaultFn(() => Date.now()),
    startedAt: integer("startedAt"),
    completedAt: integer("completedAt"),
  },
  (table) => ({
    // Index for efficient queue operations (ready to process)
    queueReadyIdx: index("idx_job_queue_ready").on(
      table.status,
      table.priority,
      table.scheduledFor,
    ),
    // Index for job type filtering
    jobTypeIdx: index("idx_job_queue_type").on(table.type, table.status),
    // Index for source filtering
    jobSourceIdx: index("idx_job_queue_source").on(table.source),
  }),
);

/**
 * Type exports
 * Using drizzle's built-in type inference instead of z.infer due to compatibility issues
 */
export type InsertJobQueue = typeof jobQueue.$inferInsert;
export type JobQueue = typeof jobQueue.$inferSelect;
export type JobStatus = JobQueue["status"];

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

/**
 * Core job type definitions
 * Note: Specific job types are defined by the packages that handle them
 * to avoid circular dependencies
 */
export interface CoreJobDefinitions {
  // Core job types will be augmented by other packages
  [key: string]: {
    input: unknown;
    output: unknown;
  };
}

/**
 * Plugin job definitions (augmented by plugins)
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PluginJobDefinitions {
  // Plugins will augment this interface
}

/**
 * All job definitions (core + plugins)
 */
export type AllJobDefinitions = CoreJobDefinitions & PluginJobDefinitions;

/**
 * Job type union
 */
export type JobType = keyof AllJobDefinitions;

/**
 * Type-safe job data for a specific job type
 */
export type JobDataFor<T extends JobType> = AllJobDefinitions[T]["input"];

/**
 * Type-safe job result for a specific job type
 */
export type JobResultFor<T extends JobType> = AllJobDefinitions[T]["output"];
