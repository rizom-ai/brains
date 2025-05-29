import { sqliteTable, text, blob } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

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
  tags: text("tags", { mode: "json" }).$type<string[]>().default("[]"),
  markdown: text("markdown").notNull(),
});

/**
 * Entity embeddings table for vector search
 */
export const entityEmbeddings = sqliteTable("entity_embeddings", {
  id: text("id").primaryKey(),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
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
 * Zod schemas for entity embeddings
 */
export const insertEntityEmbeddingSchema = createInsertSchema(
  entityEmbeddings,
  {
    embedding: z.array(z.number()),
  },
);

export const selectEntityEmbeddingSchema = createSelectSchema(
  entityEmbeddings,
  {
    embedding: z.array(z.number()),
  },
);

/**
 * Entity types with type safety
 */
export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Entity = z.infer<typeof selectEntitySchema>;
export type InsertEntityEmbedding = z.infer<typeof insertEntityEmbeddingSchema>;
export type EntityEmbedding = z.infer<typeof selectEntityEmbeddingSchema>;

/**
 * Database connection type
 */
export type DrizzleDB = ReturnType<typeof drizzle>;

/**
 * Create a drizzle database connection
 */
export function createDrizzleDB(dbPath: string): DrizzleDB {
  const sqlite = new Database(dbPath);
  return drizzle(sqlite);
}
