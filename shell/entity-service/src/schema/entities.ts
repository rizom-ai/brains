import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";

/**
 * Main entities table for entity data
 * Embeddings are stored separately in the embeddings table
 * to allow immediate entity persistence while embeddings are generated async
 */
export const entities = sqliteTable(
  "entities",
  {
    // Core fields
    id: text("id").notNull(),
    entityType: text("entityType").notNull(),

    // Content with frontmatter
    content: text("content").notNull(),

    // Content hash for change detection (SHA256 hex)
    // Used by plugins to detect if content has changed without comparing full text
    contentHash: text("contentHash").notNull(),

    // Metadata from frontmatter (includes title, tags, and entity-specific fields)
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),

    // Timestamps (stored as Unix milliseconds for consistency)
    created: integer("created")
      .notNull()
      .$defaultFn(() => Date.now()),
    updated: integer("updated")
      .notNull()
      .$defaultFn(() => Date.now()),

    // NOTE: embedding column has been moved to separate 'embeddings' table
    // This allows entities to be persisted immediately while embeddings
    // are generated asynchronously in background jobs
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
