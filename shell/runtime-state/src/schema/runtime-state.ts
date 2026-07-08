import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  type SQLiteColumn,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";

type RuntimeStateTextColumn<TName extends string> = SQLiteColumn<
  {
    name: TName;
    tableName: "runtime_state_records";
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

type RuntimeStateJsonColumn = SQLiteColumn<
  {
    name: "value";
    tableName: "runtime_state_records";
    dataType: "json";
    columnType: "SQLiteTextJson";
    data: unknown;
    driverParam: string;
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
  Record<string, never>
>;

type RuntimeStateIntegerColumn<TName extends string> = SQLiteColumn<
  {
    name: TName;
    tableName: "runtime_state_records";
    dataType: "number";
    columnType: "SQLiteInteger";
    data: number;
    driverParam: number;
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
  Record<string, never>
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
