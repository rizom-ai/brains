import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  customType,
} from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { nanoid } from "nanoid";

/**
 * Create a unique ID for a database record
 */
export function createId(): string {
  return nanoid(12); // ~17 years to have 1% collision probability at 1K IDs/hour
}

/**
 * Custom type for libSQL vector columns
 * This allows us to use F32_BLOB in libSQL while maintaining Drizzle compatibility
 */
const vector = customType<{
  data: Float32Array;
  driverData: Buffer;
}>({
  dataType() {
    return "F32_BLOB(384)"; // 384 dimensions for all-MiniLM-L6-v2
  },
  toDriver(value: Float32Array): Buffer {
    return Buffer.from(value.buffer);
  },
  fromDriver(value: Buffer): Float32Array {
    return new Float32Array(
      value.buffer,
      value.byteOffset,
      value.byteLength / 4,
    );
  },
});

/**
 * Custom type for JSON arrays in libSQL
 * Works around Drizzle ORM issue with JSON mode
 */
const jsonArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return "text";
  },
  toDriver(value: string[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
});

/**
 * Main entities table with embedded vectors
 * This schema combines the entity data with embeddings for efficient queries
 */
export const entities = sqliteTable("entities", {
  // Core fields
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  entityType: text("entityType").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),

  // Content metadata
  contentWeight: real("contentWeight").notNull().default(1.0),
  tags: jsonArray("tags").notNull().default([]),

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
});

/**
 * Entity relationships table
 * Stores connections between entities
 */
export const entityRelations = sqliteTable("entity_relations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  sourceId: text("source_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  targetId: text("target_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  relationType: text("relation_type").notNull(), // e.g., "references", "parent", "related"
  metadata: text("metadata", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default(sql`'{}'`),
  created: integer("created")
    .notNull()
    .$defaultFn(() => Date.now()),
});

/**
 * Zod schemas for validation
 */
export const insertEntitySchema = createInsertSchema(entities, {
  contentWeight: z.number().min(0).max(1).default(1.0),
  embedding: z.instanceof(Float32Array),
});

export const selectEntitySchema = createSelectSchema(entities, {
  contentWeight: z.number().min(0).max(1),
  embedding: z.instanceof(Float32Array),
});

export const insertEntityRelationSchema = createInsertSchema(entityRelations, {
  metadata: z.record(z.unknown()).default({}),
});

export const selectEntityRelationSchema = createSelectSchema(entityRelations, {
  metadata: z.record(z.unknown()),
});

/**
 * Type exports
 */
export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Entity = z.infer<typeof selectEntitySchema>;
export type InsertEntityRelation = z.infer<typeof insertEntityRelationSchema>;
export type EntityRelation = z.infer<typeof selectEntityRelationSchema>;
