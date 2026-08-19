import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import type {
  SqliteIntegerColumn,
  SqliteJsonColumn,
  SqliteTextColumn,
} from "@brains/db";

type RuntimeStateTextColumn<TName extends string> = SqliteTextColumn<
  "runtime_state_records",
  TName,
  true
>;

type RuntimeStateJsonColumn = SqliteJsonColumn<
  "runtime_state_records",
  "value",
  unknown,
  true
>;

type RuntimeStateIntegerColumn<TName extends string> = SqliteIntegerColumn<
  "runtime_state_records",
  TName,
  true
>;

type RuntimeStateRecordsTable = SQLiteTableWithColumns<{
  name: "runtime_state_records";
  schema: undefined;
  columns: {
    namespace: RuntimeStateTextColumn<"namespace">;
    key: RuntimeStateTextColumn<"key">;
    value: RuntimeStateJsonColumn;
    createdAt: RuntimeStateIntegerColumn<"created_at">;
    updatedAt: RuntimeStateIntegerColumn<"updated_at">;
  };
  dialect: "sqlite";
}>;

export const runtimeStateRecords: RuntimeStateRecordsTable = sqliteTable(
  "runtime_state_records",
  {
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.namespace, table.key] }),
    namespaceUpdatedAtIdx: index("idx_runtime_state_namespace_updated_at").on(
      table.namespace,
      table.updatedAt,
    ),
  }),
);

export type RuntimeStateRecord = typeof runtimeStateRecords.$inferSelect;
export type InsertRuntimeStateRecord = typeof runtimeStateRecords.$inferInsert;
