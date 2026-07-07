import {
  text,
  primaryKey,
  sqliteTable,
  type SQLiteColumn,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import { vector } from "./vector";

type EmbeddingTextColumn<TName extends string> = SQLiteColumn<
  {
    name: TName;
    tableName: "embeddings";
    dataType: "string";
    columnType: "SQLiteText";
    data: string;
    driverParam: string;
    notNull: true;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: [string, ...string[]];
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  { length: number | undefined }
>;

type EmbeddingVectorColumn = SQLiteColumn<
  {
    name: "embedding";
    tableName: "embeddings";
    dataType: "custom";
    columnType: "SQLiteCustomColumn";
    data: Float32Array;
    driverParam: Buffer;
    notNull: true;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  { sqliteColumnBuilderBrand: "SQLiteCustomColumnBuilderBrand" }
>;

type EmbeddingsTable = SQLiteTableWithColumns<{
  name: "embeddings";
  schema: undefined;
  columns: {
    entityId: EmbeddingTextColumn<"entity_id">;
    entityType: EmbeddingTextColumn<"entity_type">;
    embedding: EmbeddingVectorColumn;
    contentHash: EmbeddingTextColumn<"content_hash">;
  };
  dialect: "sqlite";
}>;

/**
 * Embeddings table for vector search
 * Separated from entities to allow immediate entity persistence
 * while embeddings are generated asynchronously
 */
export const embeddings: EmbeddingsTable = sqliteTable(
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
