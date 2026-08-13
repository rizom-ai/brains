import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  type SQLiteColumn,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";
import type { ProjectionWriteIntent } from "../projection-contracts";

type ProjectionTextColumn<
  TTable extends string,
  TName extends string,
  TNotNull extends boolean,
  THasDefault extends boolean = false,
  TPrimaryKey extends boolean = false,
  TData = string,
  TEnumValues extends [string, ...string[]] = [string, ...string[]],
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTable;
    dataType: "string";
    columnType: "SQLiteText";
    data: TData;
    driverParam: string;
    notNull: TNotNull;
    hasDefault: THasDefault;
    isPrimaryKey: TPrimaryKey;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: TEnumValues;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  { length: number | undefined }
>;

type ProjectionIntegerColumn<
  TTable extends string,
  TName extends string,
  TNotNull extends boolean,
  THasDefault extends boolean = false,
  TPrimaryKey extends boolean = false,
  TAutoincrement extends boolean = false,
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTable;
    dataType: "number";
    columnType: "SQLiteInteger";
    data: number;
    driverParam: number;
    notNull: TNotNull;
    hasDefault: THasDefault;
    isPrimaryKey: TPrimaryKey;
    isAutoincrement: TAutoincrement;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  Record<string, never>
>;

type ProjectionJsonColumn<
  TTable extends string,
  TName extends string,
  TData,
  THasDefault extends boolean = false,
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTable;
    dataType: "json";
    columnType: "SQLiteTextJson";
    data: TData;
    driverParam: string;
    notNull: true;
    hasDefault: THasDefault;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  { $type: TData }
>;

type ProjectionDirtyInputsTable = SQLiteTableWithColumns<{
  name: "projection_dirty_inputs";
  schema: undefined;
  columns: {
    generation: ProjectionIntegerColumn<
      "projection_dirty_inputs",
      "generation",
      true,
      true,
      true
    >;
    sourceType: ProjectionTextColumn<
      "projection_dirty_inputs",
      "source_type",
      true
    >;
    sourceId: ProjectionTextColumn<
      "projection_dirty_inputs",
      "source_id",
      true
    >;
    revision: ProjectionTextColumn<"projection_dirty_inputs", "revision", true>;
    operation: ProjectionTextColumn<
      "projection_dirty_inputs",
      "operation",
      true,
      false,
      false,
      "upsert" | "delete",
      ["upsert", "delete"]
    >;
    markedAt: ProjectionIntegerColumn<
      "projection_dirty_inputs",
      "marked_at",
      true
    >;
  };
  dialect: "sqlite";
}>;

type ProjectionWavesTable = SQLiteTableWithColumns<{
  name: "projection_waves";
  schema: undefined;
  columns: {
    id: ProjectionTextColumn<"projection_waves", "id", true, false, true>;
    cutoffGeneration: ProjectionIntegerColumn<
      "projection_waves",
      "cutoff_generation",
      true
    >;
    graphFingerprint: ProjectionTextColumn<
      "projection_waves",
      "graph_fingerprint",
      true
    >;
    status: ProjectionTextColumn<
      "projection_waves",
      "status",
      true,
      false,
      false,
      "running" | "completed" | "failed",
      ["running", "completed", "failed"]
    >;
    startedAt: ProjectionIntegerColumn<"projection_waves", "started_at", true>;
    completedAt: ProjectionIntegerColumn<
      "projection_waves",
      "completed_at",
      false
    >;
  };
  dialect: "sqlite";
}>;

type ProjectionIncidentsTable = SQLiteTableWithColumns<{
  name: "projection_incidents";
  schema: undefined;
  columns: {
    waveId: ProjectionTextColumn<
      "projection_incidents",
      "wave_id",
      true,
      false,
      true
    >;
    ruleId: ProjectionTextColumn<"projection_incidents", "rule_id", true>;
    jobId: ProjectionTextColumn<"projection_incidents", "job_id", false>;
    failureReason: ProjectionTextColumn<
      "projection_incidents",
      "failure_reason",
      true
    >;
    recoveryGeneration: ProjectionIntegerColumn<
      "projection_incidents",
      "recovery_generation",
      true
    >;
    createdAt: ProjectionIntegerColumn<
      "projection_incidents",
      "created_at",
      true
    >;
    resolvedAt: ProjectionIntegerColumn<
      "projection_incidents",
      "resolved_at",
      false
    >;
  };
  dialect: "sqlite";
}>;

type ProjectionWaveInputsTable = SQLiteTableWithColumns<{
  name: "projection_wave_inputs";
  schema: undefined;
  columns: {
    waveId: ProjectionTextColumn<"projection_wave_inputs", "wave_id", true>;
    sourceType: ProjectionTextColumn<
      "projection_wave_inputs",
      "source_type",
      true
    >;
    sourceId: ProjectionTextColumn<"projection_wave_inputs", "source_id", true>;
    revision: ProjectionTextColumn<"projection_wave_inputs", "revision", true>;
    operation: ProjectionTextColumn<
      "projection_wave_inputs",
      "operation",
      true,
      false,
      false,
      "upsert" | "delete",
      ["upsert", "delete"]
    >;
    generation: ProjectionIntegerColumn<
      "projection_wave_inputs",
      "generation",
      true
    >;
  };
  dialect: "sqlite";
}>;

export interface ProjectionChangedTarget {
  entityType: string;
  entityId: string;
  operation: "upsert" | "delete";
  contentHash?: string | undefined;
}

type ProjectionWaveRulesTable = SQLiteTableWithColumns<{
  name: "projection_wave_rules";
  schema: undefined;
  columns: {
    waveId: ProjectionTextColumn<"projection_wave_rules", "wave_id", true>;
    ruleId: ProjectionTextColumn<"projection_wave_rules", "rule_id", true>;
    targetType: ProjectionTextColumn<
      "projection_wave_rules",
      "target_type",
      true
    >;
    level: ProjectionIntegerColumn<"projection_wave_rules", "level", true>;
    jobId: ProjectionTextColumn<"projection_wave_rules", "job_id", false>;
    status: ProjectionTextColumn<
      "projection_wave_rules",
      "status",
      true,
      false,
      false,
      "pending" | "queued" | "completed" | "failed",
      ["pending", "queued", "completed", "failed"]
    >;
    inputFingerprint: ProjectionTextColumn<
      "projection_wave_rules",
      "input_fingerprint",
      false
    >;
    changedTargets: ProjectionJsonColumn<
      "projection_wave_rules",
      "changed_targets",
      ProjectionChangedTarget[],
      true
    >;
  };
  dialect: "sqlite";
}>;

type ProjectionRuleMemosTable = SQLiteTableWithColumns<{
  name: "projection_rule_memos";
  schema: undefined;
  columns: {
    ruleId: ProjectionTextColumn<"projection_rule_memos", "rule_id", true>;
    ruleVersion: ProjectionTextColumn<
      "projection_rule_memos",
      "rule_version",
      true
    >;
    inputFingerprint: ProjectionTextColumn<
      "projection_rule_memos",
      "input_fingerprint",
      true
    >;
    writeIntents: ProjectionJsonColumn<
      "projection_rule_memos",
      "write_intents",
      ProjectionWriteIntent[]
    >;
    createdAt: ProjectionIntegerColumn<
      "projection_rule_memos",
      "created_at",
      true
    >;
  };
  dialect: "sqlite";
}>;

export const projectionDirtyInputs: ProjectionDirtyInputsTable = sqliteTable(
  "projection_dirty_inputs",
  {
    generation: integer("generation").primaryKey({ autoIncrement: true }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    revision: text("revision").notNull(),
    operation: text("operation", { enum: ["upsert", "delete"] }).notNull(),
    markedAt: integer("marked_at").notNull(),
  },
  (table) => ({
    generationIdx: index("projection_dirty_inputs_generation_idx").on(
      table.generation,
    ),
  }),
);

export const projectionWaves: ProjectionWavesTable = sqliteTable(
  "projection_waves",
  {
    id: text("id").primaryKey(),
    cutoffGeneration: integer("cutoff_generation").notNull(),
    graphFingerprint: text("graph_fingerprint").notNull(),
    status: text("status", {
      enum: ["running", "completed", "failed"],
    }).notNull(),
    startedAt: integer("started_at").notNull(),
    completedAt: integer("completed_at"),
  },
);

export const projectionIncidents: ProjectionIncidentsTable = sqliteTable(
  "projection_incidents",
  {
    waveId: text("wave_id")
      .primaryKey()
      .references(() => projectionWaves.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    jobId: text("job_id"),
    failureReason: text("failure_reason").notNull(),
    recoveryGeneration: integer("recovery_generation").notNull(),
    createdAt: integer("created_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (table) => ({
    unresolvedIdx: index("projection_incidents_unresolved_idx").on(
      table.resolvedAt,
      table.createdAt,
    ),
  }),
);

export const projectionWaveInputs: ProjectionWaveInputsTable = sqliteTable(
  "projection_wave_inputs",
  {
    waveId: text("wave_id")
      .notNull()
      .references(() => projectionWaves.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    revision: text("revision").notNull(),
    operation: text("operation", { enum: ["upsert", "delete"] }).notNull(),
    generation: integer("generation").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.waveId, table.sourceType, table.sourceId],
    }),
    generationIdx: index("projection_wave_inputs_generation_idx").on(
      table.waveId,
      table.generation,
    ),
  }),
);

export const projectionWaveRules: ProjectionWaveRulesTable = sqliteTable(
  "projection_wave_rules",
  {
    waveId: text("wave_id")
      .notNull()
      .references(() => projectionWaves.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    targetType: text("target_type").notNull(),
    level: integer("level").notNull(),
    jobId: text("job_id"),
    status: text("status", {
      enum: ["pending", "queued", "completed", "failed"],
    }).notNull(),
    inputFingerprint: text("input_fingerprint"),
    changedTargets: text("changed_targets", { mode: "json" })
      .$type<ProjectionChangedTarget[]>()
      .notNull()
      .default([]),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.waveId, table.ruleId] }),
    statusIdx: index("projection_wave_rules_status_idx").on(
      table.waveId,
      table.status,
      table.level,
    ),
  }),
);

export const projectionRuleMemos: ProjectionRuleMemosTable = sqliteTable(
  "projection_rule_memos",
  {
    ruleId: text("rule_id").notNull(),
    ruleVersion: text("rule_version").notNull(),
    inputFingerprint: text("input_fingerprint").notNull(),
    writeIntents: text("write_intents", { mode: "json" })
      .$type<ProjectionWriteIntent[]>()
      .notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.ruleId, table.ruleVersion, table.inputFingerprint],
    }),
  }),
);

export type ProjectionDirtyInput = typeof projectionDirtyInputs.$inferSelect;
export type ProjectionIncident = typeof projectionIncidents.$inferSelect;
export type ProjectionWave = typeof projectionWaves.$inferSelect;
export type ProjectionWaveInput = typeof projectionWaveInputs.$inferSelect;
export type ProjectionWaveRule = typeof projectionWaveRules.$inferSelect;
export type ProjectionRuleMemo = typeof projectionRuleMemos.$inferSelect;
