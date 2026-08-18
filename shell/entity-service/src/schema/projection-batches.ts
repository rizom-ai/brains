import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import type {
  ProjectionIntegerColumn,
  ProjectionTextColumn,
} from "./projection-state";

type ProjectionAdmissionStateTable = SQLiteTableWithColumns<{
  name: "projection_admission_state";
  schema: undefined;
  columns: {
    id: ProjectionIntegerColumn<
      "projection_admission_state",
      "id",
      true,
      true,
      true
    >;
    epoch: ProjectionIntegerColumn<
      "projection_admission_state",
      "epoch",
      true,
      true
    >;
  };
  dialect: "sqlite";
}>;

type ProjectionBatchesTable = SQLiteTableWithColumns<{
  name: "projection_batches";
  schema: undefined;
  columns: {
    id: ProjectionTextColumn<"projection_batches", "id", true, false, true>;
    source: ProjectionTextColumn<"projection_batches", "source", true>;
    operationId: ProjectionTextColumn<
      "projection_batches",
      "operation_id",
      true
    >;
    status: ProjectionTextColumn<
      "projection_batches",
      "status",
      true,
      false,
      false,
      "preparing" | "open" | "closed" | "abandoned",
      ["preparing", "open", "closed", "abandoned"]
    >;
    ownerKind: ProjectionTextColumn<
      "projection_batches",
      "owner_kind",
      true,
      false,
      false,
      "callback" | "job-root",
      ["callback", "job-root"]
    >;
    ownerToken: ProjectionTextColumn<"projection_batches", "owner_token", true>;
    rootJobId: ProjectionTextColumn<"projection_batches", "root_job_id", false>;
    expectedChildren: ProjectionIntegerColumn<
      "projection_batches",
      "expected_children",
      true,
      true
    >;
    enqueueComplete: ProjectionIntegerColumn<
      "projection_batches",
      "enqueue_complete",
      true,
      true
    >;
    enqueueFailed: ProjectionIntegerColumn<
      "projection_batches",
      "enqueue_failed",
      true,
      true
    >;
    openedAt: ProjectionIntegerColumn<"projection_batches", "opened_at", true>;
    lastProgressAt: ProjectionIntegerColumn<
      "projection_batches",
      "last_progress_at",
      true
    >;
    leaseExpiresAt: ProjectionIntegerColumn<
      "projection_batches",
      "lease_expires_at",
      false
    >;
    terminalAt: ProjectionIntegerColumn<
      "projection_batches",
      "terminal_at",
      false
    >;
    recoveredAt: ProjectionIntegerColumn<
      "projection_batches",
      "recovered_at",
      false
    >;
    firstGeneration: ProjectionIntegerColumn<
      "projection_batches",
      "first_generation",
      false
    >;
    highestGeneration: ProjectionIntegerColumn<
      "projection_batches",
      "highest_generation",
      false
    >;
    mutationCount: ProjectionIntegerColumn<
      "projection_batches",
      "mutation_count",
      true,
      true
    >;
    recoveryGeneration: ProjectionIntegerColumn<
      "projection_batches",
      "recovery_generation",
      false
    >;
  };
  dialect: "sqlite";
}>;

type ProjectionBatchChildrenTable = SQLiteTableWithColumns<{
  name: "projection_batch_children";
  schema: undefined;
  columns: {
    batchId: ProjectionTextColumn<
      "projection_batch_children",
      "batch_id",
      true
    >;
    childKey: ProjectionTextColumn<
      "projection_batch_children",
      "child_key",
      true
    >;
    jobId: ProjectionTextColumn<"projection_batch_children", "job_id", false>;
    status: ProjectionTextColumn<
      "projection_batch_children",
      "status",
      true,
      true,
      false,
      "expected" | "active" | "completed" | "failed" | "missing",
      ["expected", "active", "completed", "failed", "missing"]
    >;
    terminalAt: ProjectionIntegerColumn<
      "projection_batch_children",
      "terminal_at",
      false
    >;
  };
  dialect: "sqlite";
}>;

/** Singleton epoch used to fence waves that overlap a bulk mutation. */
export const projectionAdmissionState: ProjectionAdmissionStateTable =
  sqliteTable("projection_admission_state", {
    id: integer("id").primaryKey(),
    epoch: integer("epoch").notNull().default(0),
  });

export const projectionBatches: ProjectionBatchesTable = sqliteTable(
  "projection_batches",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    operationId: text("operation_id").notNull(),
    status: text("status", {
      enum: ["preparing", "open", "closed", "abandoned"],
    }).notNull(),
    ownerKind: text("owner_kind", {
      enum: ["callback", "job-root"],
    }).notNull(),
    ownerToken: text("owner_token").notNull(),
    rootJobId: text("root_job_id"),
    expectedChildren: integer("expected_children").notNull().default(0),
    enqueueComplete: integer("enqueue_complete").notNull().default(0),
    enqueueFailed: integer("enqueue_failed").notNull().default(0),
    openedAt: integer("opened_at").notNull(),
    lastProgressAt: integer("last_progress_at").notNull(),
    leaseExpiresAt: integer("lease_expires_at"),
    terminalAt: integer("terminal_at"),
    recoveredAt: integer("recovered_at"),
    firstGeneration: integer("first_generation"),
    highestGeneration: integer("highest_generation"),
    mutationCount: integer("mutation_count").notNull().default(0),
    recoveryGeneration: integer("recovery_generation"),
  },
  (table) => ({
    operationIdx: uniqueIndex("projection_batches_operation_idx").on(
      table.source,
      table.operationId,
    ),
    admissionIdx: index("projection_batches_admission_idx").on(
      table.status,
      table.openedAt,
    ),
    rootJobIdx: index("projection_batches_root_job_idx").on(table.rootJobId),
    recoveryIdx: index("projection_batches_recovery_idx").on(
      table.recoveredAt,
      table.recoveryGeneration,
    ),
  }),
);

export const projectionBatchChildren: ProjectionBatchChildrenTable =
  sqliteTable(
    "projection_batch_children",
    {
      batchId: text("batch_id")
        .notNull()
        .references(() => projectionBatches.id, { onDelete: "cascade" }),
      childKey: text("child_key").notNull(),
      jobId: text("job_id"),
      status: text("status", {
        enum: ["expected", "active", "completed", "failed", "missing"],
      })
        .notNull()
        .default("expected"),
      terminalAt: integer("terminal_at"),
    },
    (table) => ({
      pk: primaryKey({ columns: [table.batchId, table.childKey] }),
      jobIdx: uniqueIndex("projection_batch_children_job_idx").on(table.jobId),
      statusIdx: index("projection_batch_children_status_idx").on(
        table.batchId,
        table.status,
      ),
    }),
  );

export type ProjectionBatch = typeof projectionBatches.$inferSelect;
export type ProjectionBatchChild = typeof projectionBatchChildren.$inferSelect;
