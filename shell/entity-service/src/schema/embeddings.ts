import { text, primaryKey, sqliteTable } from "drizzle-orm/sqlite-core";
import { vector } from "./vector";

/**
 * Embeddings table for vector search
 * Separated from entities to allow immediate entity persistence
 * while embeddings are generated asynchronously
 */
export const embeddings = sqliteTable(
  "embeddings",
  {
    // Foreign key to entities (composite: id + entityType)
    entityId: text("entity_id").notNull(),
    entityType: text("entity_type").notNull(),

    // Vector embedding for semantic search
    // NOTE: This column has a vector index created via ensureEmbeddingIndexes():
    // CREATE INDEX embeddings_idx ON embeddings(libsql_vector_idx(embedding))
    embedding: vector("embedding").notNull(),

    // Content hash to detect stale embeddings
    // If entity.contentHash != embedding.contentHash, embedding is stale
    contentHash: text("content_hash").notNull(),
  },
  (table) => {
    return {
      // Composite primary key on entityId + entityType
      pk: primaryKey({ columns: [table.entityId, table.entityType] }),
    };
  },
);

/**
 * Type exports
 */
export type InsertEmbedding = typeof embeddings.$inferInsert;
export type Embedding = typeof embeddings.$inferSelect;
