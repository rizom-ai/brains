import type { JobQueueEnqueueRequest } from "@brains/job-queue";
import {
  index,
  integer,
  sqliteTable,
  text,
  type SQLiteColumn,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";

type OutboxTextColumn = SQLiteColumn<
  {
    name: "id";
    tableName: "entity_job_outbox";
    dataType: "string";
    columnType: "SQLiteText";
    data: string;
    driverParam: string;
    notNull: true;
    hasDefault: false;
    isPrimaryKey: true;
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

type OutboxRequestColumn = SQLiteColumn<
  {
    name: "request";
    tableName: "entity_job_outbox";
    dataType: "json";
    columnType: "SQLiteTextJson";
    data: JobQueueEnqueueRequest;
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
  { $type: JobQueueEnqueueRequest }
>;

type OutboxCreatedAtColumn = SQLiteColumn<
  {
    name: "created_at";
    tableName: "entity_job_outbox";
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

type EntityJobOutboxTable = SQLiteTableWithColumns<{
  name: "entity_job_outbox";
  schema: undefined;
  columns: {
    id: OutboxTextColumn;
    request: OutboxRequestColumn;
    createdAt: OutboxCreatedAtColumn;
  };
  dialect: "sqlite";
}>;

/**
 * Durable embedding-job intents committed in the same transaction as entities.
 * The web owner relays them idempotently into the separate job database.
 */
export const entityJobOutbox: EntityJobOutboxTable = sqliteTable(
  "entity_job_outbox",
  {
    id: text("id").primaryKey(),
    request: text("request", { mode: "json" })
      .$type<JobQueueEnqueueRequest>()
      .notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    deliveryOrderIdx: index("entity_job_outbox_delivery_order_idx").on(
      table.createdAt,
      table.id,
    ),
  }),
);

export type EntityJobOutboxRow = typeof entityJobOutbox.$inferSelect;
