import {
  sqliteTable,
  text,
  integer,
  index,
  type SQLiteColumn,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import { createId } from "@brains/utils/id";
import type { JobContext } from "./types";
import type { ProgressNotification } from "@brains/utils/progress";

type JobQueueStatus = "pending" | "processing" | "completed" | "failed";

type JobQueueTextColumn<
  TName extends string,
  TNotNull extends boolean,
  THasDefault extends boolean = false,
  TPrimaryKey extends boolean = false,
  THasRuntimeDefault extends boolean = false,
  TData = string,
  TEnumValues extends [string, ...string[]] = [string, ...string[]],
> = SQLiteColumn<
  {
    name: TName;
    tableName: "job_queue";
    dataType: "string";
    columnType: "SQLiteText";
    data: TData;
    driverParam: string;
    notNull: TNotNull;
    hasDefault: THasDefault;
    isPrimaryKey: TPrimaryKey;
    isAutoincrement: false;
    hasRuntimeDefault: THasRuntimeDefault;
    enumValues: TEnumValues;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  { length: number | undefined }
>;

type JobQueueIntegerColumn<
  TName extends string,
  TNotNull extends boolean,
  THasDefault extends boolean = false,
  THasRuntimeDefault extends boolean = false,
> = SQLiteColumn<
  {
    name: TName;
    tableName: "job_queue";
    dataType: "number";
    columnType: "SQLiteInteger";
    data: number;
    driverParam: number;
    notNull: TNotNull;
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

type JobQueueJsonColumn<
  TName extends string,
  TData,
  TNotNull extends boolean,
  TExtraConfig extends object = Record<string, never>,
> = SQLiteColumn<
  {
    name: TName;
    tableName: "job_queue";
    dataType: "json";
    columnType: "SQLiteTextJson";
    data: TData;
    driverParam: string;
    notNull: TNotNull;
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
  TExtraConfig
>;

type WorkerSessionTextColumn<
  TName extends string,
  TPrimaryKey extends boolean = false,
> = SQLiteColumn<
  {
    name: TName;
    tableName: "job_worker_sessions";
    dataType: "string";
    columnType: "SQLiteText";
    data: string;
    driverParam: string;
    notNull: true;
    hasDefault: false;
    isPrimaryKey: TPrimaryKey;
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

type WorkerSessionIntegerColumn<TName extends string> = SQLiteColumn<
  {
    name: TName;
    tableName: "job_worker_sessions";
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

type JobWorkerSessionsTable = SQLiteTableWithColumns<{
  name: "job_worker_sessions";
  schema: undefined;
  columns: {
    slotId: WorkerSessionTextColumn<"slotId", true>;
    sessionId: WorkerSessionTextColumn<"sessionId">;
    startedAt: WorkerSessionIntegerColumn<"startedAt">;
    heartbeatAt: WorkerSessionIntegerColumn<"heartbeatAt">;
  };
  dialect: "sqlite";
}>;

type JobQueueTable = SQLiteTableWithColumns<{
  name: "job_queue";
  schema: undefined;
  columns: {
    id: JobQueueTextColumn<"id", true, true, true, true>;
    type: JobQueueTextColumn<"type", true>;
    data: JobQueueTextColumn<"data", true>;
    result: JobQueueJsonColumn<"result", unknown, false>;
    progress: JobQueueJsonColumn<
      "progress",
      ProgressNotification,
      false,
      { $type: ProgressNotification }
    >;
    source: JobQueueTextColumn<"source", false>;
    metadata: JobQueueJsonColumn<
      "metadata",
      JobContext,
      true,
      { $type: JobContext }
    >;
    status: JobQueueTextColumn<
      "status",
      true,
      true,
      false,
      false,
      JobQueueStatus,
      ["pending", "processing", "completed", "failed"]
    >;
    priority: JobQueueIntegerColumn<"priority", true, true>;
    retryCount: JobQueueIntegerColumn<"retryCount", true, true>;
    maxRetries: JobQueueIntegerColumn<"maxRetries", true, true>;
    lastError: JobQueueTextColumn<"lastError", false>;
    createdAt: JobQueueIntegerColumn<"createdAt", true, true, true>;
    scheduledFor: JobQueueIntegerColumn<"scheduledFor", true, true, true>;
    startedAt: JobQueueIntegerColumn<"startedAt", false>;
    completedAt: JobQueueIntegerColumn<"completedAt", false>;
    attemptId: JobQueueTextColumn<"attemptId", false>;
    workerSlotId: JobQueueTextColumn<"workerSlotId", false>;
    workerSessionId: JobQueueTextColumn<"workerSessionId", false>;
    leaseExpiresAt: JobQueueIntegerColumn<"leaseExpiresAt", false>;
    attemptHeartbeatAt: JobQueueIntegerColumn<"attemptHeartbeatAt", false>;
    runtimeUpdatedAt: JobQueueIntegerColumn<"runtimeUpdatedAt", false>;
  };
  dialect: "sqlite";
}>;

/**
 * Generic job queue table for async background processing
 * Supports different job types with discriminated unions
 */
// Internal use only - DO NOT re-export from package index
// Exporting this table causes TypeScript type explosion in consuming packages
export const jobQueue: JobQueueTable = sqliteTable(
  "job_queue",
  {
    // Queue item ID (unique job ID)
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),

    // Job type for handler dispatch
    type: text("type").notNull(),

    // Job data (JSON string - type-specific payload)
    data: text("data").notNull(),

    // Job result (JSON - type-specific result after completion)
    result: text("result", { mode: "json" }),

    // Latest durable progress snapshot for cross-process observers.
    progress: text("progress", { mode: "json" }).$type<ProgressNotification>(),

    // Job source (who created this job)
    source: text("source"),

    // Job metadata (additional context for progress events)
    metadata: text("metadata", { mode: "json" }).$type<JobContext>().notNull(),

    // Queue metadata
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    priority: integer("priority").notNull().default(0),
    retryCount: integer("retryCount").notNull().default(0),
    maxRetries: integer("maxRetries").notNull().default(3),
    lastError: text("lastError"),

    // Timestamps
    createdAt: integer("createdAt")
      .notNull()
      .$defaultFn(() => Date.now()),
    scheduledFor: integer("scheduledFor")
      .notNull()
      .$defaultFn(() => Date.now()),
    startedAt: integer("startedAt"),
    completedAt: integer("completedAt"),

    // Processing-attempt ownership and fencing.
    attemptId: text("attemptId"),
    workerSlotId: text("workerSlotId"),
    workerSessionId: text("workerSessionId"),
    leaseExpiresAt: integer("leaseExpiresAt"),
    attemptHeartbeatAt: integer("attemptHeartbeatAt"),
    runtimeUpdatedAt: integer("runtimeUpdatedAt"),
  },
  (table) => ({
    // Index for efficient queue operations (ready to process)
    queueReadyIdx: index("idx_job_queue_ready").on(
      table.status,
      table.priority,
      table.scheduledFor,
    ),
    // Index for job type filtering
    jobTypeIdx: index("idx_job_queue_type").on(table.type, table.status),
    // Cover durable progress polling by (updatedAt, jobId).
    runtimeUpdatesIdx: index("idx_job_queue_runtime_updates").on(
      table.runtimeUpdatedAt,
      table.id,
    ),
    // Index for source filtering
    jobSourceIdx: index("idx_job_queue_source").on(table.source),
  }),
);

/** One live session per stable worker slot. */
export const jobWorkerSessions: JobWorkerSessionsTable = sqliteTable(
  "job_worker_sessions",
  {
    slotId: text("slotId").primaryKey(),
    sessionId: text("sessionId").notNull().unique(),
    startedAt: integer("startedAt").notNull(),
    heartbeatAt: integer("heartbeatAt").notNull(),
  },
  (table) => ({
    heartbeatIdx: index("idx_job_worker_sessions_heartbeat").on(
      table.heartbeatAt,
    ),
  }),
);

/**
 * Type exports
 */
export type InsertJobQueue = typeof jobQueue.$inferInsert;
export type JobQueue = typeof jobQueue.$inferSelect;
export type JobWorkerSession = typeof jobWorkerSessions.$inferSelect;

export type JobStatus = JobQueue["status"];
