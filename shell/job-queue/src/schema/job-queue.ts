import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createId } from "@brains/utils";
import type { JobContext } from "./types";

/**
 * Generic job queue table for async background processing
 * Supports different job types with discriminated unions
 */
// Internal use only - DO NOT re-export from package index
// Exporting this table causes TypeScript type explosion in consuming packages
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
    result: text("result", { mode: "json" }),

    // Job source (who created this job)
    source: text("source"),

    // Job metadata (additional context for progress events)
    metadata: text("metadata", { mode: "json" })
      .$type<JobContext>()
      .notNull(),

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
 */
export type InsertJobQueue = typeof jobQueue.$inferInsert;
export type JobQueue = typeof jobQueue.$inferSelect;

export type JobStatus = JobQueue["status"];

