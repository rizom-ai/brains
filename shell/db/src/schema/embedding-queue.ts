import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { createId } from "./utils";
import { selectEntitySchema, type Entity } from "./entities";

/**
 * Zod schema for entity without embedding
 */
const entityWithoutEmbeddingSchema = selectEntitySchema.omit({
  embedding: true,
});

/**
 * Embedding queue table for async embedding generation
 * Uses box pattern to store complete entity data while processing
 */
export const embeddingQueue = sqliteTable(
  "embedding_queue",
  {
    // Queue item ID (not entity ID)
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),

    // Boxed entity data (complete entity without embedding)
    entityData: text("entityData", { mode: "json" })
      .$type<Omit<Entity, "embedding">>()
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
    queueReadyIdx: index("idx_queue_ready").on(
      table.status,
      table.priority,
      table.scheduledFor,
    ),
  }),
);

/**
 * Zod schemas for embedding queue validation
 */
export const insertEmbeddingQueueSchema = createInsertSchema(embeddingQueue, {
  entityData: entityWithoutEmbeddingSchema,
  status: z
    .enum(["pending", "processing", "completed", "failed"])
    .default("pending"),
  priority: z.number().int().default(0),
  retryCount: z.number().int().min(0).default(0),
  maxRetries: z.number().int().min(0).default(3),
});

export const selectEmbeddingQueueSchema = createSelectSchema(embeddingQueue, {
  entityData: entityWithoutEmbeddingSchema,
  status: z.enum(["pending", "processing", "completed", "failed"]),
  priority: z.number().int(),
  retryCount: z.number().int().min(0),
  maxRetries: z.number().int().min(0),
});

/**
 * Type exports
 */
export type InsertEmbeddingQueue = z.infer<typeof insertEmbeddingQueueSchema>;
export type EmbeddingQueue = z.infer<typeof selectEmbeddingQueueSchema>;
export type QueueStatus = EmbeddingQueue["status"];

/**
 * Queue options for entity creation
 */
export interface QueueOptions {
  priority?: number; // Job priority (higher = more important)
  maxRetries?: number; // Override default retry count
  delayMs?: number; // Initial delay before processing
}

/**
 * Queue statistics
 */
export interface QueueStats {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
  total: number;
}
