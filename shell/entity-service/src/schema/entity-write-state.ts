import {
  primaryKey,
  sqliteTable,
  text,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import type { SqliteTextColumn } from "@brains/db";

type StateText<
  TTable extends string,
  TName extends string,
  TNotNull extends boolean = true,
> = SqliteTextColumn<TTable, TName, TNotNull, false, false, false>;

type EntityWriteReceiptsTable = SQLiteTableWithColumns<{
  name: "entity_write_receipts";
  schema: undefined;
  columns: {
    operationId: StateText<"entity_write_receipts", "operation_id">;
    entityType: StateText<"entity_write_receipts", "entity_type">;
    entityId: StateText<"entity_write_receipts", "entity_id">;
    expectedRevision: StateText<
      "entity_write_receipts",
      "expected_revision",
      false
    >;
  };
  dialect: "sqlite";
}>;

/** No entity foreign key: editing/deleting output must not erase evidence of completion. */
export const entityWriteReceipts: EntityWriteReceiptsTable = sqliteTable(
  "entity_write_receipts",
  {
    operationId: text("operation_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    expectedRevision: text("expected_revision"),
  },
  (table) => ({ pk: primaryKey({ columns: [table.operationId] }) }),
);
