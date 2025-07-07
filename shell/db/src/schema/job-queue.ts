import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { createId } from "./utils";
import type {
  ContentGenerationJobData,
  ContentDerivationJobData,
} from "@brains/content-generator";

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
  }),
);

/**
 * Zod schemas for job queue validation
 */
export const insertJobQueueSchema = createInsertSchema(jobQueue, {
  type: z.string().min(1),
  data: z.string(),
  result: z.unknown().optional(),
  status: z
    .enum(["pending", "processing", "completed", "failed"])
    .default("pending"),
  priority: z.number().int().default(0),
  retryCount: z.number().int().min(0).default(0),
  maxRetries: z.number().int().min(0).default(3),
});

export const selectJobQueueSchema = createSelectSchema(jobQueue, {
  type: z.string(),
  data: z.string(),
  result: z.unknown().optional(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  priority: z.number().int(),
  retryCount: z.number().int().min(0),
  maxRetries: z.number().int().min(0),
});

/**
 * Type exports
 */
export type InsertJobQueue = z.infer<typeof insertJobQueueSchema>;
export type JobQueue = z.infer<typeof selectJobQueueSchema>;
export type JobStatus = JobQueue["status"];

/**
 * Job options for job creation
 */
export interface JobOptions {
  priority?: number; // Job priority (higher = more important)
  maxRetries?: number; // Override default retry count
  delayMs?: number; // Initial delay before processing
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
 */
export interface CoreJobDefinitions {
  embedding: {
    input: EntityWithoutEmbedding;
    output: void;
  };
  "content-generation": {
    input: ContentGenerationJobData;
    output: string;
  };
  "content-derivation": {
    input: ContentDerivationJobData;
    output: { entityId: string; success: boolean };
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

/**
 * Entity data without embedding - used for embedding jobs
 */
export type EntityWithoutEmbedding = {
  id: string;
  entityType: string;
  content: string;
  metadata: Record<string, unknown>;
  created: number;
  updated: number;
  contentWeight: number;
};

/**
 * Content generation request - used for content generation jobs
 */
export interface ContentGenerationRequest {
  templateName: string;
  context: {
    prompt?: string | undefined;
    data?: Record<string, unknown> | undefined;
  };
  userId?: string | undefined;
}
