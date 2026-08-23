import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import type { SqliteIntegerColumn, SqliteTextColumn } from "@brains/db";

type ExportTextColumn<
  TName extends string,
  TData = string,
  TEnumValues extends [string, ...string[]] = [string, ...string[]],
> = SqliteTextColumn<
  "entity_export_intents",
  TName,
  true,
  false,
  false,
  false,
  TData,
  TEnumValues
>;

type ExportIntegerColumn<TName extends string> = SqliteIntegerColumn<
  "entity_export_intents",
  TName,
  true,
  false,
  false
>;

type EntityExportIntentsTable = SQLiteTableWithColumns<{
  name: "entity_export_intents";
  schema: undefined;
  columns: {
    entityType: ExportTextColumn<"entity_type">;
    entityId: ExportTextColumn<"entity_id">;
    operation: ExportTextColumn<
      "operation",
      "upsert" | "delete",
      ["upsert", "delete"]
    >;
    revision: ExportTextColumn<"revision">;
    markedAt: ExportIntegerColumn<"marked_at">;
  };
  dialect: "sqlite";
}>;

/**
 * Latest unacknowledged directory export for each durable entity.
 *
 * The row is written in the same SQLite transaction as the entity mutation.
 * A persistence integration may remove it only after the corresponding file
 * mutation has crossed its own durable checkpoint.
 *
 * Collapsing mutations to one row assumes persistence converges one stable
 * namespace derived from (entityType, entityId). Directory Sync enforces this
 * for content-derived image extensions by deleting obsolete alternatives.
 */
export const entityExportIntents: EntityExportIntentsTable = sqliteTable(
  "entity_export_intents",
  {
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    operation: text("operation", { enum: ["upsert", "delete"] }).notNull(),
    revision: text("revision").notNull(),
    markedAt: integer("marked_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.entityType, table.entityId] }),
    markedAtIdx: index("entity_export_intents_marked_at_idx").on(
      table.markedAt,
    ),
  }),
);
