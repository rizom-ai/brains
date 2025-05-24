import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, customType } from "drizzle-orm/sqlite-core";
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
    return 'F32_BLOB(1536)'; // 1536 dimensions for OpenAI ada-002
  },
  toDriver(value: Float32Array): Buffer {
    return Buffer.from(value.buffer);
  },
  fromDriver(value: Buffer): Float32Array {
    return new Float32Array(value.buffer, value.byteOffset, value.byteLength / 4);
  },
});

/**
 * Main entities table with embedded vectors
 * This schema combines the entity data with embeddings for efficient queries
 */
export const entities = sqliteTable("entities", {
  // Core fields
  id: text("id").primaryKey().$defaultFn(() => createId()),
  entityType: text("entityType").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  
  // Content metadata
  contentWeight: real("contentWeight").notNull().default(1.0),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  
  // Vector embedding for semantic search
  embedding: vector("embedding"),
  embeddingStatus: text("embeddingStatus").$type<'pending' | 'processing' | 'ready' | 'failed'>().default('pending'),
  
  // Timestamps (stored as Unix milliseconds for consistency)
  created: integer("created").notNull().$defaultFn(() => Date.now()),
  updated: integer("updated").notNull().$defaultFn(() => Date.now()),
});

/**
 * Entity versions table for history tracking
 * Stores previous versions of entities
 */
export const entityVersions = sqliteTable("entity_versions", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  
  // Snapshot of entity data at this version
  title: text("title").notNull(),
  content: text("content").notNull(),
  contentWeight: real("contentWeight").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
  
  // When this version was created
  created: integer("created").notNull(),
  
  // Who/what created this version
  createdBy: text("created_by"),
  changeReason: text("change_reason"),
});

/**
 * Entity relationships table
 * Stores connections between entities
 */
export const entityRelations = sqliteTable("entity_relations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  sourceId: text("source_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  targetId: text("target_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  relationType: text("relation_type").notNull(), // e.g., "references", "parent", "related"
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().default(sql`'{}'`),
  created: integer("created").notNull().$defaultFn(() => Date.now()),
});

/**
 * Zod schemas for validation
 */
export const insertEntitySchema = createInsertSchema(entities, {
  tags: z.array(z.string()).default([]),
  contentWeight: z.number().min(0).max(1).default(1.0),
  embedding: z.instanceof(Float32Array).optional(),
  embeddingStatus: z.enum(['pending', 'processing', 'ready', 'failed']).default('pending'),
});

export const selectEntitySchema = createSelectSchema(entities, {
  tags: z.array(z.string()),
  contentWeight: z.number().min(0).max(1),
  embedding: z.instanceof(Float32Array).optional(),
  embeddingStatus: z.enum(['pending', 'processing', 'ready', 'failed']),
});

export const insertEntityVersionSchema = createInsertSchema(entityVersions, {
  tags: z.array(z.string()),
  contentWeight: z.number().min(0).max(1),
});

export const selectEntityVersionSchema = createSelectSchema(entityVersions, {
  tags: z.array(z.string()),
  contentWeight: z.number().min(0).max(1),
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
export type InsertEntityVersion = z.infer<typeof insertEntityVersionSchema>;
export type EntityVersion = z.infer<typeof selectEntityVersionSchema>;
export type InsertEntityRelation = z.infer<typeof insertEntityRelationSchema>;
export type EntityRelation = z.infer<typeof selectEntityRelationSchema>;
