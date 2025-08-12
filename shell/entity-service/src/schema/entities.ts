import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { vector } from "./vector";

/**
 * Main entities table with embedded vectors
 * This schema combines the entity data with embeddings for efficient queries
 */
export const entities = sqliteTable(
  "entities",
  {
    // Core fields
    id: text("id").notNull(),
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
  },
  (table) => {
    return {
      // Composite primary key on id + entityType
      pk: primaryKey({ columns: [table.id, table.entityType] }),
    };
  },
);

/**
 * Type exports
 * Using drizzle's built-in type inference instead of z.infer due to compatibility issues
 */
export type InsertEntity = typeof entities.$inferInsert;
export type Entity = typeof entities.$inferSelect;
