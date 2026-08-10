import {
  foreignKey,
  text,
  primaryKey,
  sqliteTable,
  type SQLiteColumn,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import type { SqliteTextColumn } from "@brains/db";
import { vector } from "./vector";
import { entities } from "./entities";

type EmbeddingTextColumn<TName extends string> = SqliteTextColumn<
  "embeddings",
  TName,
  true
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
 * Derived vectors stored beside entities in the same database. Keeping them in
 * a separate table allows immediate entity persistence and atomic invalidation.
 */
export const embeddings: EmbeddingsTable = sqliteTable(
  "embeddings",
  {
    // Foreign key to entities (composite: id + entityType)
    entityId: text("entity_id").notNull(),
    entityType: text("entity_type").notNull(),

    // Vector embedding for semantic search; queried with vector_distance_cos
    embedding: vector("embedding").notNull(),

    // Content hash to detect stale embeddings
    // If entity.contentHash != embedding.contentHash, embedding is stale
    contentHash: text("content_hash").notNull(),
  },
  (table) => {
    return {
      // Composite primary key on entityId + entityType
      pk: primaryKey({ columns: [table.entityId, table.entityType] }),
      entity: foreignKey({
        columns: [table.entityId, table.entityType],
        foreignColumns: [entities.id, entities.entityType],
      }).onDelete("cascade"),
    };
  },
);

/**
 * Type exports
 */
export type InsertEmbedding = typeof embeddings.$inferInsert;
export type Embedding = typeof embeddings.$inferSelect;
