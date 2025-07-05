import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { createId } from "./utils";
import { vector } from "./vector";

/**
 * Main entities table with embedded vectors
 * This schema combines the entity data with embeddings for efficient queries
 */
export const entities = sqliteTable("entities", {
  // Core fields
  id: text("id")
    .notNull()
    .$defaultFn(() => createId()),
  entityType: text("entityType").notNull(),

  // Content with frontmatter
  content: text("content").notNull(),

  // Metadata from frontmatter (includes title, tags, and entity-specific fields)
  metadata: text("metadata", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'`),

  // Content metadata
  contentWeight: real("contentWeight").notNull().default(1.0),

  // Vector embedding for semantic search
  // NOTE: This column has a vector index created via migration:
  // CREATE INDEX entities_embedding_idx ON entities(libsql_vector_idx(embedding))
  // Drizzle doesn't support libSQL vector functions in schema definitions yet
  embedding: vector("embedding").notNull(),

  // Timestamps (stored as Unix milliseconds for consistency)
  created: integer("created")
    .notNull()
    .$defaultFn(() => Date.now()),
  updated: integer("updated")
    .notNull()
    .$defaultFn(() => Date.now()),
}, (table) => {
  return {
    // Composite unique constraint on entityType + id
    entityTypeIdUnique: uniqueIndex("entity_type_id_unique").on(table.entityType, table.id),
  };
});

/**
 * Zod schemas for validation
 */
export const insertEntitySchema = createInsertSchema(entities, {
  contentWeight: z.number().min(0).max(1).default(1.0),
  embedding: z.instanceof(Float32Array),
  metadata: z.record(z.unknown()),
});

export const selectEntitySchema = createSelectSchema(entities, {
  contentWeight: z.number().min(0).max(1),
  embedding: z.instanceof(Float32Array),
  metadata: z.record(z.unknown()),
});

/**
 * Type exports
 */
export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Entity = z.infer<typeof selectEntitySchema>;
