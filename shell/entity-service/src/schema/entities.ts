import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  check,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import type {
  SqliteIntegerColumn,
  SqliteJsonColumn,
  SqliteTextColumn,
} from "@brains/db";

type EntityTextColumn<
  TName extends string,
  TNotNull extends boolean,
  THasDefault extends boolean = false,
  TData = string,
  TEnumValues extends [string, ...string[]] = [string, ...string[]],
> = SqliteTextColumn<
  "entities",
  TName,
  TNotNull,
  THasDefault,
  false,
  false,
  TData,
  TEnumValues
>;

type EntityIntegerColumn<
  TName extends string,
  THasDefault extends boolean,
  THasRuntimeDefault extends boolean,
> = SqliteIntegerColumn<
  "entities",
  TName,
  true,
  THasDefault,
  THasRuntimeDefault
>;

type EntityJsonColumn<
  TName extends string,
  TData,
  THasDefault extends boolean,
  TExtraConfig extends object,
> = SqliteJsonColumn<"entities", TName, TData, true, TExtraConfig, THasDefault>;

type EntitiesTable = SQLiteTableWithColumns<{
  name: "entities";
  schema: undefined;
  columns: {
    id: EntityTextColumn<"id", true>;
    entityType: EntityTextColumn<"entityType", true>;
    content: EntityTextColumn<"content", true>;
    contentHash: EntityTextColumn<"contentHash", true>;
    visibility: EntityTextColumn<
      "visibility",
      true,
      true,
      "public" | "shared" | "restricted",
      ["public", "shared", "restricted"]
    >;
    metadata: EntityJsonColumn<
      "metadata",
      Record<string, unknown>,
      true,
      { $type: Record<string, unknown> }
    >;
    created: EntityIntegerColumn<"created", true, true>;
    updated: EntityIntegerColumn<"updated", true, true>;
  };
  dialect: "sqlite";
}>;

/**
 * Main entities table for entity data
 * Embeddings are stored separately in the embeddings table
 * to allow immediate entity persistence while embeddings are generated async
 */
export const entities: EntitiesTable = sqliteTable(
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

    // Visibility boundary for read/search/derivation policies
    visibility: text("visibility", {
      enum: ["public", "shared", "restricted"],
    })
      .notNull()
      .default("public"),

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
      visibilityCheck: check(
        "entities_visibility_check",
        sql`${table.visibility} IN ('public', 'shared', 'restricted')`,
      ),
    };
  },
);

/**
 * Type exports
 * Using drizzle's built-in type inference instead of z.infer due to compatibility issues
 */
export type InsertEntity = typeof entities.$inferInsert;
export type Entity = typeof entities.$inferSelect;
