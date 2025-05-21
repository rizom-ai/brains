import { sqliteTable, text, blob, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Create a unique ID for a database record
 */
export function createId(): string {
  return crypto.randomUUID();
}

/**
 * Entities table for storing all entity types
 */
export const entities = sqliteTable("entities", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  created: text("created").notNull(),
  updated: text("updated").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
  markdown: text("markdown").notNull(),
});

/**
 * Entity chunks table for breaking up entities for efficient processing and search
 */
export const entityChunks = sqliteTable("entity_chunks", {
  id: text("id").primaryKey(),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

/**
 * Entity embeddings table for vector search
 */
export const entityEmbeddings = sqliteTable("entity_embeddings", {
  id: text("id").primaryKey(),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  chunkId: text("chunk_id").references(() => entityChunks.id, {
    onDelete: "cascade",
  }),
  embedding: blob("embedding", { mode: "json" }).$type<number[]>(),
  createdAt: text("created_at").notNull(),
});

/**
 * Zod schemas for entities
 */
export const insertEntitySchema = createInsertSchema(entities, {
  tags: z.array(z.string()).default([]),
});

export const selectEntitySchema = createSelectSchema(entities, {
  tags: z.array(z.string()).default([]),
});

/**
 * Zod schemas for entity chunks
 */
export const insertEntityChunkSchema = createInsertSchema(entityChunks);
export const selectEntityChunkSchema = createSelectSchema(entityChunks);

/**
 * Zod schemas for entity embeddings
 */
export const insertEntityEmbeddingSchema = createInsertSchema(
  entityEmbeddings,
  {
    embedding: z.array(z.number()),
    chunkId: z.string().optional(),
  },
);

export const selectEntityEmbeddingSchema = createSelectSchema(
  entityEmbeddings,
  {
    embedding: z.array(z.number()),
    chunkId: z.string().optional(),
  },
);

/**
 * Entity types with type safety
 */
export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Entity = z.infer<typeof selectEntitySchema>;
export type InsertEntityChunk = z.infer<typeof insertEntityChunkSchema>;
export type EntityChunk = z.infer<typeof selectEntityChunkSchema>;
export type InsertEntityEmbedding = z.infer<typeof insertEntityEmbeddingSchema>;
export type EntityEmbedding = z.infer<typeof selectEntityEmbeddingSchema>;
