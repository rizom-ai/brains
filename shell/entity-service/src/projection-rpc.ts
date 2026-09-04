import { z } from "@brains/utils/zod";
import {
  createRpcResultParser,
  type LocalDatabaseTransport,
  type RpcResultParser,
  type RpcResultSchemas,
} from "@brains/db";
import { ProjectionWriteIntentSchema } from "./projection-contracts";
import type {
  ApplyProjectionRuleResultInput,
  BulkMutationInput,
  ClaimProjectionWaveInput,
  DurableBulkMutationChildInput,
  GetProjectionRuleMemoInput,
  IProjectionStore,
  MarkProjectionDirtyInput,
  ProjectionBatchScope,
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

export type ProjectionStoreRpcTransport =
  LocalDatabaseTransport<ProjectionStoreRpcRequest>;

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
  | { operation: "getWave"; waveId: string }
  | { operation: "supersedeWaveIfStale"; waveId: string; supersededAt: number }
  | { operation: "getWaveRule"; waveId: string; ruleId: string }
  | { operation: "applyRuleResult"; input: ApplyProjectionRuleResultInput }
  | { operation: "getRuleMemo"; input: GetProjectionRuleMemoInput }
  | { operation: "openCallbackBatch"; input: BulkMutationInput }
  | { operation: "renewCallbackBatch"; scope: ProjectionBatchScope }
  | { operation: "closeCallbackBatch"; scope: ProjectionBatchScope }
  | {
      operation: "openDurableBatchChild";
      input: DurableBulkMutationChildInput;
    };

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
const bulkMutationInputSchema = z.strictObject({
  source: nonEmptyString,
  operationId: nonEmptyString,
});
const durableRootInputSchema = bulkMutationInputSchema.extend({
  rootJobId: nonEmptyString,
  expectedChildren: z.number().int().nonnegative(),
});
const durableChildInputSchema = durableRootInputSchema.extend({
  childKey: nonEmptyString,
  jobId: nonEmptyString,
});
export const ProjectionBatchScopeSchema: z.ZodType<
  ProjectionBatchScope,
  unknown
> = z.strictObject({
  batchId: nonEmptyString,
  source: nonEmptyString,
  operationId: nonEmptyString,
  ownerToken: nonEmptyString,
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
  z.strictObject({ operation: z.literal("getWave"), ...waveIdSchema }),
  z.strictObject({
    operation: z.literal("supersedeWaveIfStale"),
    ...waveIdSchema,
    supersededAt: timestamp,
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
  z.strictObject({
    operation: z.literal("openCallbackBatch"),
    input: bulkMutationInputSchema,
  }),
  z.strictObject({
    operation: z.literal("renewCallbackBatch"),
    scope: ProjectionBatchScopeSchema,
  }),
  z.strictObject({
    operation: z.literal("closeCallbackBatch"),
    scope: ProjectionBatchScopeSchema,
  }),
  z.strictObject({
    operation: z.literal("openDurableBatchChild"),
    input: durableChildInputSchema,
  }),
]);

const dirtyRecordSchema: z.ZodType<ProjectionDirtyInput, unknown> =
  dirtyInputSchema.extend({ generation: z.number().int().nonnegative() });
const waveSchema: z.ZodType<ProjectionWave, unknown> = z.strictObject({
  id: nonEmptyString,
  cutoffGeneration: z.number().int().nonnegative(),
  admissionEpoch: z.number().int().nonnegative(),
  graphFingerprint: nonEmptyString,
  status: z.enum(["running", "completed", "failed", "superseded"]),
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

const nullableWaveSchema = waveSchema.nullable();
// A rule whose wave moved on applies to nothing, so the owner returns null.
const nullableWaveRuleSchema = waveRuleSchema.nullable();
const undefinedResultSchema = z.undefined();

/**
 * What each operation answers. The schema map below is checked against this,
 * so the two cannot drift, and keying both by operation is what lets
 * `parseProjectionStoreRpcResult` return the operation's own type — callers no
 * longer re-assert it at the transport boundary.
 */
export interface ProjectionStoreRpcResults {
  markDirty: number;
  listPendingInputs: ProjectionDirtyInput[];
  claimPendingWave: ProjectionWave | null;
  getActiveWave: ProjectionWave | null;
  getWave: ProjectionWave | null;
  listWaveInputs: ProjectionWaveInput[];
  completeWave: ProjectionWave;
  failWave: ProjectionWave;
  failWaveWithIncident: ProjectionWave;
  getUnresolvedProjectionIncidentDiagnostics: ProjectionIncidentDiagnostics;
  putWaveRules: undefined;
  listWaveRules: ProjectionWaveRule[];
  queueWaveRule: ProjectionWaveRule;
  applyRuleResult: ProjectionWaveRule | null;
  getWaveRule: ProjectionWaveRule | null;
  getRuleMemo: ProjectionRuleMemo | null;
  supersedeWaveIfStale: boolean;
  openCallbackBatch: ProjectionBatchScope;
  openDurableBatchChild: ProjectionBatchScope;
  renewCallbackBatch: undefined;
  closeCallbackBatch: undefined;
}

export type ProjectionStoreRpcOperation = keyof ProjectionStoreRpcResults;

const resultSchemas: RpcResultSchemas<ProjectionStoreRpcResults> = {
  markDirty: z.number().int().nonnegative(),
  listPendingInputs: z.array(dirtyRecordSchema),
  claimPendingWave: nullableWaveSchema,
  getActiveWave: nullableWaveSchema,
  getWave: nullableWaveSchema,
  listWaveInputs: z.array(waveInputSchema),
  completeWave: waveSchema,
  failWave: waveSchema,
  failWaveWithIncident: waveSchema,
  getUnresolvedProjectionIncidentDiagnostics: incidentDiagnosticsSchema,
  putWaveRules: undefinedResultSchema,
  listWaveRules: z.array(waveRuleSchema),
  queueWaveRule: waveRuleSchema,
  applyRuleResult: nullableWaveRuleSchema,
  getWaveRule: nullableWaveRuleSchema,
  getRuleMemo: memoSchema.nullable(),
  supersedeWaveIfStale: z.boolean(),
  openCallbackBatch: ProjectionBatchScopeSchema,
  openDurableBatchChild: ProjectionBatchScopeSchema,
  renewCallbackBatch: undefinedResultSchema,
  closeCallbackBatch: undefinedResultSchema,
};

export const parseProjectionStoreRpcResult: RpcResultParser<ProjectionStoreRpcResults> =
  createRpcResultParser(resultSchemas);

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
    case "getWave":
      return store.getWave(request.waveId);
    case "supersedeWaveIfStale":
      return store.supersedeWaveIfStale(request.waveId, request.supersededAt);
    case "getWaveRule":
      return store.getWaveRule(request.waveId, request.ruleId);
    case "applyRuleResult":
      return store.applyRuleResult(request.input);
    case "getRuleMemo":
      return store.getRuleMemo(request.input);
    case "openCallbackBatch":
      return store.openCallbackBatch(request.input);
    case "renewCallbackBatch":
      return store.renewCallbackBatch(request.scope);
    case "closeCallbackBatch":
      return store.closeCallbackBatch(request.scope);
    case "openDurableBatchChild":
      return store.openDurableBatchChild(request.input);
  }
}

export type { ProjectionRuleMemo };
