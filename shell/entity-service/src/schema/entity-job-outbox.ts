import type {
  SqliteIntegerColumn,
  SqliteJsonColumn,
  SqliteTable,
  SqliteTextColumn,
} from "@brains/db";
import type { JobQueueEnqueueRequest } from "@brains/job-queue";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

type EntityJobOutboxTable = SqliteTable<
  "entity_job_outbox",
  {
    id: SqliteTextColumn<"entity_job_outbox", "id", true, false, true>;
    request: SqliteJsonColumn<
      "entity_job_outbox",
      "request",
      JobQueueEnqueueRequest,
      true,
      { $type: JobQueueEnqueueRequest }
    >;
    createdAt: SqliteIntegerColumn<"entity_job_outbox", "created_at", true>;
    parkedAt: SqliteIntegerColumn<"entity_job_outbox", "parked_at", false>;
    failureReason: SqliteTextColumn<
      "entity_job_outbox",
      "failure_reason",
      false
    >;
  }
>;

/**
 * Durable embedding-job intents committed in the same transaction as entities.
 * Permanently invalid requests are parked rather than blocking valid intents.
 */
export const entityJobOutbox: EntityJobOutboxTable = sqliteTable(
  "entity_job_outbox",
  {
    id: text("id").primaryKey(),
    request: text("request", { mode: "json" })
      .$type<JobQueueEnqueueRequest>()
      .notNull(),
    createdAt: integer("created_at").notNull(),
    parkedAt: integer("parked_at"),
    failureReason: text("failure_reason"),
  },
  (table) => ({
    deliveryOrderIdx: index("entity_job_outbox_delivery_order_idx").on(
      table.createdAt,
      table.id,
    ),
    pendingDeliveryOrderIdx: index(
      "entity_job_outbox_pending_delivery_order_idx",
    ).on(table.parkedAt, table.createdAt, table.id),
  }),
);

export type EntityJobOutboxRow = typeof entityJobOutbox.$inferSelect;
