import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  check,
  type SQLiteColumn,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";

type EntityTextColumn<
  TName extends string,
  TNotNull extends boolean,
  THasDefault extends boolean = false,
  TData = string,
  TEnumValues extends [string, ...string[]] = [string, ...string[]],
> = SQLiteColumn<
  {
    name: TName;
    tableName: "entities";
    dataType: "string";
    columnType: "SQLiteText";
    data: TData;
    driverParam: string;
    notNull: TNotNull;
    hasDefault: THasDefault;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: TEnumValues;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  { length: number | undefined }
>;

type EntityIntegerColumn<
  TName extends string,
  THasDefault extends boolean,
  THasRuntimeDefault extends boolean,
> = SQLiteColumn<
  {
    name: TName;
    tableName: "entities";
    dataType: "number";
    columnType: "SQLiteInteger";
    data: number;
    driverParam: number;
    notNull: true;
    hasDefault: THasDefault;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: THasRuntimeDefault;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  Record<string, never>
>;

type EntityJsonColumn<
  TName extends string,
  TData,
  THasDefault extends boolean,
  TExtraConfig extends object,
> = SQLiteColumn<
  {
    name: TName;
    tableName: "entities";
    dataType: "json";
    columnType: "SQLiteTextJson";
    data: TData;
    driverParam: string;
    notNull: true;
    hasDefault: THasDefault;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  TExtraConfig
>;

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
