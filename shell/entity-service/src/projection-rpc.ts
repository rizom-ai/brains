import { z } from "@brains/utils/zod";
import { ProjectionWriteIntentSchema } from "./projection-contracts";
import type {
  ApplyProjectionRuleResultInput,
  ClaimProjectionWaveInput,
  GetProjectionRuleMemoInput,
  IProjectionStore,
  MarkProjectionDirtyInput,
  ProjectionIncidentDiagnostics,
  ProjectionIncidentInput,
  ProjectionRuleMemoValue,
  ProjectionWaveRuleInput,
} from "./projection-store";
import type {
  ProjectionDirtyInput,
  ProjectionIncident,
  ProjectionRuleMemo,
  ProjectionWave,
  ProjectionWaveInput,
  ProjectionWaveRule,
} from "./schema/projection-state";

export const PROJECTION_STORE_RPC_SERVICE = "entity-projection";

export interface ProjectionStoreRpcTransport {
  initialize(): Promise<void>;
  request(
    payload: ProjectionStoreRpcRequest,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<unknown>;
  close(): void;
}

export type ProjectionStoreRpcRequest =
  | { operation: "markDirty"; input: MarkProjectionDirtyInput }
  | { operation: "listPendingInputs" }
  | { operation: "claimPendingWave"; input: ClaimProjectionWaveInput }
  | { operation: "listWaveInputs"; waveId: string }
  | { operation: "getActiveWave" }
  | { operation: "completeWave"; waveId: string; completedAt: number }
  | { operation: "failWave"; waveId: string; failedAt: number }
  | { operation: "failWaveWithIncident"; input: ProjectionIncidentInput }
  | {
      operation: "getUnresolvedProjectionIncidentDiagnostics";
      limit?: number | undefined;
    }
  | {
      operation: "putWaveRules";
      waveId: string;
      rules: readonly ProjectionWaveRuleInput[];
    }
  | { operation: "listWaveRules"; waveId: string }
  | {
      operation: "queueWaveRule";
      waveId: string;
      ruleId: string;
      jobId: string;
    }
  | { operation: "getWaveRule"; waveId: string; ruleId: string }
  | { operation: "applyRuleResult"; input: ApplyProjectionRuleResultInput }
  | { operation: "getRuleMemo"; input: GetProjectionRuleMemoInput };

const nonEmptyString = z.string().trim().min(1);
const timestamp = z.number().int().nonnegative();
const waveIdSchema = { waveId: nonEmptyString };
const dirtyInputSchema = z.strictObject({
  sourceType: nonEmptyString,
  sourceId: nonEmptyString,
  revision: nonEmptyString,
  operation: z.enum(["upsert", "delete"]),
  markedAt: timestamp,
});
const waveRuleInputSchema = z.strictObject({
  ruleId: nonEmptyString,
  targetType: nonEmptyString,
  level: z.number().int().nonnegative(),
});
const memoKeySchema = z.strictObject({
  ruleId: nonEmptyString,
  ruleVersion: nonEmptyString,
  inputFingerprint: nonEmptyString,
});
const applyRuleResultSchema = z.strictObject({
  waveId: nonEmptyString,
  ruleId: nonEmptyString,
  ruleVersion: nonEmptyString,
  inputFingerprint: nonEmptyString,
  writeIntents: z.array(ProjectionWriteIntentSchema),
  completedAt: timestamp,
});
const incidentInputSchema: z.ZodType<ProjectionIncidentInput, unknown> =
  z.strictObject({
    waveId: nonEmptyString,
    ruleId: nonEmptyString,
    jobId: nonEmptyString.nullable(),
    failureReason: nonEmptyString.max(500),
    failedAt: timestamp,
  });

export const ProjectionStoreRpcRequestSchema: z.ZodType<
  ProjectionStoreRpcRequest,
  unknown
> = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("markDirty"),
    input: dirtyInputSchema,
  }),
  z.strictObject({ operation: z.literal("listPendingInputs") }),
  z.strictObject({
    operation: z.literal("claimPendingWave"),
    input: z.strictObject({
      waveId: nonEmptyString,
      graphFingerprint: nonEmptyString,
      startedAt: timestamp,
    }),
  }),
  z.strictObject({ operation: z.literal("listWaveInputs"), ...waveIdSchema }),
  z.strictObject({ operation: z.literal("getActiveWave") }),
  z.strictObject({
    operation: z.literal("completeWave"),
    ...waveIdSchema,
    completedAt: timestamp,
  }),
  z.strictObject({
    operation: z.literal("failWave"),
    ...waveIdSchema,
    failedAt: timestamp,
  }),
  z.strictObject({
    operation: z.literal("failWaveWithIncident"),
    input: incidentInputSchema,
  }),
  z.strictObject({
    operation: z.literal("getUnresolvedProjectionIncidentDiagnostics"),
    limit: z.number().int().positive().max(100).optional(),
  }),
  z.strictObject({
    operation: z.literal("putWaveRules"),
    ...waveIdSchema,
    rules: z.array(waveRuleInputSchema).min(1),
  }),
  z.strictObject({ operation: z.literal("listWaveRules"), ...waveIdSchema }),
  z.strictObject({
    operation: z.literal("queueWaveRule"),
    ...waveIdSchema,
    ruleId: nonEmptyString,
    jobId: nonEmptyString,
  }),
  z.strictObject({
    operation: z.literal("getWaveRule"),
    ...waveIdSchema,
    ruleId: nonEmptyString,
  }),
  z.strictObject({
    operation: z.literal("applyRuleResult"),
    input: applyRuleResultSchema,
  }),
  z.strictObject({ operation: z.literal("getRuleMemo"), input: memoKeySchema }),
]) as z.ZodType<ProjectionStoreRpcRequest, unknown>;

const dirtyRecordSchema: z.ZodType<ProjectionDirtyInput, unknown> =
  dirtyInputSchema.extend({ generation: z.number().int().nonnegative() });
const waveSchema: z.ZodType<ProjectionWave, unknown> = z.strictObject({
  id: nonEmptyString,
  cutoffGeneration: z.number().int().nonnegative(),
  graphFingerprint: nonEmptyString,
  status: z.enum(["running", "completed", "failed"]),
  startedAt: timestamp,
  completedAt: timestamp.nullable(),
});
const waveInputSchema: z.ZodType<ProjectionWaveInput, unknown> = z.strictObject(
  {
    waveId: nonEmptyString,
    sourceType: nonEmptyString,
    sourceId: nonEmptyString,
    revision: nonEmptyString,
    operation: z.enum(["upsert", "delete"]),
    generation: z.number().int().nonnegative(),
  },
);
const changedTargetSchema = z.strictObject({
  entityType: nonEmptyString,
  entityId: nonEmptyString,
  operation: z.enum(["upsert", "delete"]),
  contentHash: z.string().min(1).optional(),
});
const waveRuleSchema: z.ZodType<ProjectionWaveRule, unknown> = z.strictObject({
  waveId: nonEmptyString,
  ruleId: nonEmptyString,
  targetType: nonEmptyString,
  level: z.number().int().nonnegative(),
  jobId: z.string().nullable(),
  status: z.enum(["pending", "queued", "completed", "failed"]),
  inputFingerprint: z.string().nullable(),
  changedTargets: z.array(changedTargetSchema),
});
const memoSchema: z.ZodType<ProjectionRuleMemoValue, unknown> = z.strictObject({
  ruleId: nonEmptyString,
  ruleVersion: nonEmptyString,
  inputFingerprint: nonEmptyString,
  writeIntents: z.array(ProjectionWriteIntentSchema),
  createdAt: timestamp,
});
const incidentSchema: z.ZodType<ProjectionIncident, unknown> = z.strictObject({
  waveId: nonEmptyString,
  ruleId: nonEmptyString,
  jobId: nonEmptyString.nullable(),
  failureReason: nonEmptyString,
  recoveryGeneration: z.number().int().nonnegative(),
  createdAt: timestamp,
  resolvedAt: timestamp.nullable(),
});
const incidentDiagnosticsSchema: z.ZodType<
  ProjectionIncidentDiagnostics,
  unknown
> = z.strictObject({
  total: z.number().int().nonnegative(),
  incidents: z.array(incidentSchema),
});

export function parseProjectionStoreRpcRequest(
  input: unknown,
): ProjectionStoreRpcRequest {
  return ProjectionStoreRpcRequestSchema.parse(input);
}

export function parseProjectionStoreRpcResult(
  request: ProjectionStoreRpcRequest,
  input: unknown,
): unknown {
  switch (request.operation) {
    case "markDirty":
      return z.number().int().nonnegative().parse(input);
    case "listPendingInputs":
      return z.array(dirtyRecordSchema).parse(input);
    case "claimPendingWave":
    case "getActiveWave":
      return input === null ? null : waveSchema.parse(input);
    case "listWaveInputs":
      return z.array(waveInputSchema).parse(input);
    case "completeWave":
    case "failWave":
    case "failWaveWithIncident":
      return waveSchema.parse(input);
    case "getUnresolvedProjectionIncidentDiagnostics":
      return incidentDiagnosticsSchema.parse(input);
    case "putWaveRules":
      return z.undefined().parse(input);
    case "listWaveRules":
      return z.array(waveRuleSchema).parse(input);
    case "queueWaveRule":
    case "applyRuleResult":
      return waveRuleSchema.parse(input);
    case "getWaveRule":
      return input === null ? null : waveRuleSchema.parse(input);
    case "getRuleMemo":
      return input === null ? null : memoSchema.parse(input);
  }
}

export function handleProjectionStoreRpcRequest(
  store: IProjectionStore,
  input: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  signal?.throwIfAborted();
  const request = parseProjectionStoreRpcRequest(input);
  switch (request.operation) {
    case "markDirty":
      return store.markDirty(request.input);
    case "listPendingInputs":
      return store.listPendingInputs();
    case "claimPendingWave":
      return store.claimPendingWave(request.input);
    case "listWaveInputs":
      return store.listWaveInputs(request.waveId);
    case "getActiveWave":
      return store.getActiveWave();
    case "completeWave":
      return store.completeWave(request.waveId, request.completedAt);
    case "failWave":
      return store.failWave(request.waveId, request.failedAt);
    case "failWaveWithIncident":
      return store.failWaveWithIncident(request.input);
    case "getUnresolvedProjectionIncidentDiagnostics":
      return store.getUnresolvedProjectionIncidentDiagnostics(request.limit);
    case "putWaveRules":
      return store.putWaveRules(request.waveId, request.rules);
    case "listWaveRules":
      return store.listWaveRules(request.waveId);
    case "queueWaveRule":
      return store.queueWaveRule(request.waveId, request.ruleId, request.jobId);
    case "getWaveRule":
      return store.getWaveRule(request.waveId, request.ruleId);
    case "applyRuleResult":
      return store.applyRuleResult(request.input);
    case "getRuleMemo":
      return store.getRuleMemo(request.input);
  }
}

export type { ProjectionRuleMemo };
