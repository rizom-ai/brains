import {
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
import type { EntityMutationReceipt } from "../entity-mutation-receipt";

type ReceiptText<TName extends string> = SqliteTextColumn<
  "entity_mutation_receipts",
  TName,
  true,
  false,
  false,
  false
>;
type ReceiptTable = SQLiteTableWithColumns<{
  name: "entity_mutation_receipts";
  schema: undefined;
  columns: {
    namespace: ReceiptText<"namespace">;
    key: ReceiptText<"key">;
    result: SqliteJsonColumn<
      "entity_mutation_receipts",
      "result",
      EntityMutationReceipt,
      true,
      { $type: EntityMutationReceipt },
      false
    >;
    recordedAt: SqliteIntegerColumn<
      "entity_mutation_receipts",
      "recorded_at",
      true,
      false,
      false
    >;
  };
  dialect: "sqlite";
}>;

/** Internal receipts, deliberately independent of entity lifetime and exports. */
export const entityMutationReceipts: ReceiptTable = sqliteTable(
  "entity_mutation_receipts",
  {
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    result: text("result", { mode: "json" })
      .$type<EntityMutationReceipt>()
      .notNull(),
    recordedAt: integer("recorded_at").notNull(),
  },
  (table) => ({ pk: primaryKey({ columns: [table.namespace, table.key] }) }),
);
