import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const runtimeStateRecords = sqliteTable(
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
