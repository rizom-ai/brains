import { and, asc, eq } from "drizzle-orm";
import { z } from "@brains/utils/zod";
import type { EntityDB } from "./db";
import { EntityExportStore } from "./entity-export-store";
import type { EntityMutationAdmission } from "./mutation-admission";
import {
  type BulkMutationInput,
  type DurableBulkMutationChildInput,
  type DurableBulkMutationRootInput,
  type ProjectionBatchRecoveryResult,
  type ProjectionBatchRootReader,
  type SettleDurableBulkMutationChildInput,
} from "./projection-batch-contracts";
import {
  ProjectionBatchCoordinator,
  type ProjectionBatchDiagnostics,
} from "./projection-batch-coordinator";
import { ProjectionWaveCoordinator } from "./projection-wave-coordinator";
import {
  ProjectionWriteIntentSchema,
  type ProjectionWriteIntent,
} from "./projection-contracts";
import {
  parseJobId,
  parseRuleId,
  parseWaveId,
  parseWaveTimestamp,
  ruleReportEffect,
  coalesceLatestInputs,
  type ClaimProjectionWaveInput,
  type ProjectionIncidentDiagnostics,
  type ProjectionIncidentInput,
} from "./projection-wave-contracts";
import {
  canonicalProjectionJson,
  ProjectionWriteIntentApplier,
  type ProjectionEntityStoragePolicy,
} from "./projection-write-intent-applier";
import {
  type EntityTransaction,
  ProjectionTransactionRunner,
} from "./projection-transaction-runner";
import {
  projectionDirtyInputs,
  projectionEntityOwners,
  projectionRuleMemos,
  projectionWaveRules,
  type ProjectionChangedTarget,
  type ProjectionDirtyInput,
  type ProjectionRuleMemo,
  type ProjectionWave,
  type ProjectionWaveInput,
  type ProjectionWaveRule,
} from "./schema/projection-state";

const dirtyInputSchema = z.strictObject({
  sourceType: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  revision: z.string().trim().min(1),
  operation: z.enum(["upsert", "delete"]),
  markedAt: z.number().int().nonnegative(),
});

const memoKeySchema = z.strictObject({
  ruleId: z.string().trim().min(1),
  ruleVersion: z.string().trim().min(1),
  inputFingerprint: z.string().trim().min(1),
});

const projectionOwnedEntitySchema = z.strictObject({
  entityType: z.string().trim().min(1),
  id: z.string().trim().min(1),
});

const waveRuleInputSchema = z.strictObject({
  ruleId: z.string().trim().min(1),
  targetType: z.string().trim().min(1),
  level: z.number().int().nonnegative(),
});

const changedTargetSchema = z.strictObject({
  entityType: z.string().trim().min(1),
  entityId: z.string().trim().min(1),
  operation: z.enum(["upsert", "delete"]),
  contentHash: z.string().min(1).optional(),
});

export type {
  BulkMutationInput,
  DurableBulkMutationChildInput,
  DurableBulkMutationRootInput,
  ProjectionBatchOwnedJob,
  ProjectionBatchRecoveryResult,
  ProjectionBatchRootReader,
  SettleDurableBulkMutationChildInput,
} from "./projection-batch-contracts";

export {
  ProjectionBatchFencedError,
  type ProjectionBatchDiagnostics,
} from "./projection-batch-coordinator";
export {
  retrySqliteWrite,
  type SqliteWriteRetryOptions,
} from "./projection-transaction-runner";

export interface MarkProjectionDirtyInput {
  sourceType: string;
  sourceId: string;
  revision: string;
  operation: "upsert" | "delete";
  markedAt: number;
}

export interface GetProjectionRuleMemoInput {
  ruleId: string;
  ruleVersion: string;
  inputFingerprint: string;
}

export interface ProjectionOwnedEntityInput {
  entityType: string;
  id: string;
}

export interface ProjectionWaveRuleInput {
  ruleId: string;
  targetType: string;
  level: number;
}

export interface ApplyProjectionRuleResultInput {
  waveId: string;
  ruleId: string;
  ruleVersion: string;
  inputFingerprint: string;
  writeIntents: readonly ProjectionWriteIntent[];
  completedAt: number;
}

export interface ProjectionRuleMemoValue extends Omit<
  ProjectionRuleMemo,
  "writeIntents"
> {
  writeIntents: ProjectionWriteIntent[];
}

function parseWaveRule(rule: ProjectionWaveRule): ProjectionWaveRule {
  const changedTargets: ProjectionChangedTarget[] = z
    .array(changedTargetSchema)
    .parse(rule.changedTargets);
  return { ...rule, changedTargets };
}

export type {
  ClaimProjectionWaveInput,
  ProjectionIncidentDiagnostics,
  ProjectionIncidentInput,
} from "./projection-wave-contracts";
export type { ProjectionEntityStoragePolicy } from "./projection-write-intent-applier";

/** Entity-database persistence boundary for scheduler coordination state. */
export class ProjectionStore {
  private readonly db: EntityDB;
  private readonly writeIntentApplier: ProjectionWriteIntentApplier;
  private readonly transactions: ProjectionTransactionRunner;
  private readonly batches: ProjectionBatchCoordinator;
  private readonly waves: ProjectionWaveCoordinator;

  constructor(
    db: EntityDB,
    mutationAdmission?: EntityMutationAdmission,
    now: () => number = Date.now,
    storagePolicy?: ProjectionEntityStoragePolicy,
  ) {
    this.db = db;
    this.transactions = new ProjectionTransactionRunner(db);
    this.batches = new ProjectionBatchCoordinator({
      db,
      transactions: this.transactions,
      now,
      // Resolved when a batch asks, not now: the wave coordinator is built
      // next and needs the batch coordinator it is being handed to.
      getRecoveryGeneration: (transaction, fallback): Promise<number> =>
        this.waves.getRecoveryGeneration(transaction, fallback),
    });
    this.waves = new ProjectionWaveCoordinator({
      db,
      transactions: this.transactions,
      batches: this.batches,
    });
    this.writeIntentApplier = new ProjectionWriteIntentApplier({
      entityExportStore: new EntityExportStore(db, now),
      ...(mutationAdmission && { mutationAdmission }),
      ...(storagePolicy && { storagePolicy }),
    });
  }

  public runBulkMutation<TResult>(
    input: BulkMutationInput,
    mutation: () => Promise<TResult>,
  ): Promise<TResult> {
    return this.batches.runBulkMutation(input, mutation);
  }

  public prepareDurableBulkMutation(
    input: DurableBulkMutationRootInput,
  ): Promise<void> {
    return this.batches.prepareDurableBulkMutation(input);
  }

  public finalizeDurableBulkMutationEnqueue(
    operationId: string,
  ): Promise<void> {
    return this.batches.finalizeDurableBulkMutationEnqueue(operationId);
  }

  public failDurableBulkMutationEnqueue(operationId: string): Promise<void> {
    return this.batches.failDurableBulkMutationEnqueue(operationId);
  }

  public runDurableBulkMutationChild<TResult>(
    input: DurableBulkMutationChildInput,
    mutation: () => Promise<TResult>,
  ): Promise<TResult> {
    return this.batches.runDurableBulkMutationChild(input, mutation);
  }

  public settleDurableBulkMutationChild(
    input: SettleDurableBulkMutationChildInput,
  ): Promise<boolean> {
    return this.batches.settleDurableBulkMutationChild(input);
  }

  public recoverProjectionBatches(
    readRoot: ProjectionBatchRootReader,
  ): Promise<ProjectionBatchRecoveryResult> {
    return this.batches.recoverProjectionBatches(readRoot);
  }

  public cleanupProjectionBatches(
    retentionMs?: number,
    maximumRecords?: number,
  ): Promise<number> {
    return this.batches.cleanupProjectionBatches(retentionMs, maximumRecords);
  }

  public getProjectionBatchDiagnostics(): Promise<ProjectionBatchDiagnostics> {
    return this.batches.getProjectionBatchDiagnostics();
  }

  public async isProjectionOwnedEntity(
    input: ProjectionOwnedEntityInput,
  ): Promise<boolean> {
    const parsed = projectionOwnedEntitySchema.parse(input);
    const owners = await this.db
      .select({ entityId: projectionEntityOwners.entityId })
      .from(projectionEntityOwners)
      .where(
        and(
          eq(projectionEntityOwners.entityType, parsed.entityType),
          eq(projectionEntityOwners.entityId, parsed.id),
        ),
      )
      .limit(1);
    return owners.length > 0;
  }

  public async releaseProjectionOwnership(
    input: ProjectionOwnedEntityInput,
  ): Promise<void> {
    const parsed = projectionOwnedEntitySchema.parse(input);
    await this.db
      .delete(projectionEntityOwners)
      .where(
        and(
          eq(projectionEntityOwners.entityType, parsed.entityType),
          eq(projectionEntityOwners.entityId, parsed.id),
        ),
      );
  }

  public transferEntityAuthority<TResult>(
    input: ProjectionOwnedEntityInput,
    mutation: (transaction: EntityTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const parsed = projectionOwnedEntitySchema.parse(input);
    return this.transactions.run(async (transaction) => {
      const result = await mutation(transaction);
      await transaction
        .delete(projectionEntityOwners)
        .where(
          and(
            eq(projectionEntityOwners.entityType, parsed.entityType),
            eq(projectionEntityOwners.entityId, parsed.id),
          ),
        );
      return result;
    });
  }

  public async markDirty(input: MarkProjectionDirtyInput): Promise<number> {
    const parsed = dirtyInputSchema.parse(input);
    const rows = await this.db
      .insert(projectionDirtyInputs)
      .values(parsed)
      .returning({ generation: projectionDirtyInputs.generation });
    const generation = rows[0]?.generation;
    if (generation === undefined) {
      throw new Error("Failed to persist projection dirty input");
    }
    return generation;
  }

  public withDirtyInput<TResult>(
    input: MarkProjectionDirtyInput,
    mutation: (transaction: EntityTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const parsed = dirtyInputSchema.parse(input);
    return this.batches.runMutationTransaction(
      async (transaction, recordGeneration) => {
        const result = await mutation(transaction);
        await transaction
          .delete(projectionEntityOwners)
          .where(
            and(
              eq(projectionEntityOwners.entityType, parsed.sourceType),
              eq(projectionEntityOwners.entityId, parsed.sourceId),
            ),
          );
        const rows = await transaction
          .insert(projectionDirtyInputs)
          .values(parsed)
          .returning({ generation: projectionDirtyInputs.generation });
        const generation = rows[0]?.generation;
        if (generation === undefined) {
          throw new Error("Failed to persist projection dirty input");
        }
        await recordGeneration(generation);
        return result;
      },
    );
  }

  public async listPendingInputs(): Promise<ProjectionDirtyInput[]> {
    const inputs = await this.db
      .select()
      .from(projectionDirtyInputs)
      .orderBy(asc(projectionDirtyInputs.generation));
    return coalesceLatestInputs(inputs);
  }

  public hasActiveProjectionBatch(): Promise<boolean> {
    return this.batches.hasActiveBatch();
  }

  public claimPendingWave(
    input: ClaimProjectionWaveInput,
  ): Promise<ProjectionWave | null> {
    return this.waves.claimPendingWave(input);
  }

  public listWaveInputs(waveId: string): Promise<ProjectionWaveInput[]> {
    return this.waves.listWaveInputs(waveId);
  }

  public getWave(waveId: string): Promise<ProjectionWave | null> {
    return this.waves.getWave(waveId);
  }

  public getActiveWave(): Promise<ProjectionWave | null> {
    return this.waves.getActiveWave();
  }

  public completeWave(
    waveId: string,
    completedAt: number,
  ): Promise<ProjectionWave> {
    return this.waves.completeWave(waveId, completedAt);
  }

  public supersedeWaveIfStale(
    waveId: string,
    supersededAt: number,
  ): Promise<boolean> {
    return this.waves.supersedeWaveIfStale(waveId, supersededAt);
  }

  public failWave(waveId: string, failedAt: number): Promise<ProjectionWave> {
    return this.waves.failWave(waveId, failedAt);
  }

  public failWaveWithIncident(
    input: ProjectionIncidentInput,
  ): Promise<ProjectionWave> {
    return this.waves.failWaveWithIncident(input);
  }

  public getUnresolvedProjectionIncidentDiagnostics(
    limit?: number,
  ): Promise<ProjectionIncidentDiagnostics> {
    return this.waves.getUnresolvedProjectionIncidentDiagnostics(limit);
  }

  public async putWaveRules(
    waveId: string,
    rules: readonly ProjectionWaveRuleInput[],
  ): Promise<void> {
    const parsedWaveId = parseWaveId(waveId);
    const parsedRules = z.array(waveRuleInputSchema).min(1).parse(rules);
    const values: Array<typeof projectionWaveRules.$inferInsert> =
      parsedRules.map((rule) => ({
        waveId: parsedWaveId,
        ruleId: rule.ruleId,
        targetType: rule.targetType,
        level: rule.level,
        status: "pending",
        changedTargets: [],
      }));
    await this.db.insert(projectionWaveRules).values(values);
  }

  public async listWaveRules(waveId: string): Promise<ProjectionWaveRule[]> {
    const rows = await this.db
      .select()
      .from(projectionWaveRules)
      .where(eq(projectionWaveRules.waveId, waveId))
      .orderBy(asc(projectionWaveRules.level), asc(projectionWaveRules.ruleId));
    return rows.map(parseWaveRule);
  }

  public async queueWaveRule(
    waveId: string,
    ruleId: string,
    jobId: string,
  ): Promise<ProjectionWaveRule> {
    const parsedWaveId = parseWaveId(waveId);
    const parsedRuleId = parseRuleId(ruleId);
    const parsedJobId = parseJobId(jobId);
    const updated = await this.db
      .update(projectionWaveRules)
      .set({ status: "queued", jobId: parsedJobId })
      .where(
        and(
          eq(projectionWaveRules.waveId, parsedWaveId),
          eq(projectionWaveRules.ruleId, parsedRuleId),
          eq(projectionWaveRules.status, "pending"),
        ),
      )
      .returning();
    const queued = updated[0];
    if (queued) return parseWaveRule(queued);

    const current = await this.getWaveRule(parsedWaveId, parsedRuleId);
    if (
      current?.status === "completed" ||
      (current?.status === "queued" && current.jobId === parsedJobId)
    ) {
      return current;
    }
    throw new Error(
      `Projection rule "${parsedRuleId}" is not pending for wave "${parsedWaveId}"`,
    );
  }

  public async getWaveRule(
    waveId: string,
    ruleId: string,
  ): Promise<ProjectionWaveRule | null> {
    const rows = await this.db
      .select()
      .from(projectionWaveRules)
      .where(
        and(
          eq(projectionWaveRules.waveId, waveId),
          eq(projectionWaveRules.ruleId, ruleId),
        ),
      )
      .limit(1);
    const rule = rows[0];
    return rule ? parseWaveRule(rule) : null;
  }

  public async applyRuleResult(
    input: ApplyProjectionRuleResultInput,
  ): Promise<ProjectionWaveRule | null> {
    const waveId = parseWaveId(input.waveId);
    const key = memoKeySchema.parse({
      ruleId: input.ruleId,
      ruleVersion: input.ruleVersion,
      inputFingerprint: input.inputFingerprint,
    });
    const writeIntents = z
      .array(ProjectionWriteIntentSchema)
      .parse(input.writeIntents);
    const completedAt = parseWaveTimestamp(input.completedAt);

    return this.transactions.run(async (transaction) => {
      const ruleRows = await transaction
        .select()
        .from(projectionWaveRules)
        .where(
          and(
            eq(projectionWaveRules.waveId, waveId),
            eq(projectionWaveRules.ruleId, key.ruleId),
          ),
        )
        .limit(1);
      const currentRule = ruleRows[0];
      if (!currentRule) {
        throw new Error(
          `Projection rule "${key.ruleId}" is not scheduled for wave "${waveId}"`,
        );
      }

      const wave = await this.waves.requireWave(transaction, waveId);
      const effect = ruleReportEffect(wave.status);
      if (effect.kind === "decline") return null;
      if (effect.kind === "refuse") {
        throw new Error(`Projection wave "${waveId}" ${effect.reason}`);
      }
      const admissionEpoch = await this.batches.getAdmissionEpoch(transaction);
      if (wave.admissionEpoch !== admissionEpoch) {
        await this.waves.supersedeWaveInTransaction(
          transaction,
          wave,
          completedAt,
        );
        return null;
      }

      for (const intent of writeIntents) {
        const intentType =
          intent.operation === "upsert"
            ? intent.entity.entityType
            : intent.entityType;
        if (intentType !== currentRule.targetType) {
          throw new Error(
            `Projection rule "${key.ruleId}" cannot write entity type "${intentType}"`,
          );
        }
      }
      if (currentRule.status === "completed") {
        if (currentRule.inputFingerprint !== key.inputFingerprint) {
          throw new Error(
            `Projection rule "${key.ruleId}" already completed with another input`,
          );
        }
        return parseWaveRule(currentRule);
      }
      if (currentRule.status === "failed") {
        throw new Error(
          `Projection rule "${key.ruleId}" already failed for wave "${waveId}"`,
        );
      }

      const memoRows = await transaction
        .select()
        .from(projectionRuleMemos)
        .where(
          and(
            eq(projectionRuleMemos.ruleId, key.ruleId),
            eq(projectionRuleMemos.ruleVersion, key.ruleVersion),
            eq(projectionRuleMemos.inputFingerprint, key.inputFingerprint),
          ),
        )
        .limit(1);
      const existingMemo = memoRows[0];
      if (
        existingMemo &&
        canonicalProjectionJson(existingMemo.writeIntents) !==
          canonicalProjectionJson(writeIntents)
      ) {
        throw new Error(
          `Projection memo conflict for rule "${key.ruleId}" and fingerprint "${key.inputFingerprint}"`,
        );
      }
      if (!existingMemo) {
        await transaction.insert(projectionRuleMemos).values({
          ...key,
          writeIntents,
          createdAt: completedAt,
        });
      }

      const changedTargets: ProjectionChangedTarget[] = [];
      for (const intent of writeIntents) {
        const target = await this.writeIntentApplier.apply(
          transaction,
          intent,
          completedAt,
          key,
        );
        if (target) changedTargets.push(target);
      }

      const updatedRules = await transaction
        .update(projectionWaveRules)
        .set({
          status: "completed",
          inputFingerprint: key.inputFingerprint,
          changedTargets,
        })
        .where(
          and(
            eq(projectionWaveRules.waveId, waveId),
            eq(projectionWaveRules.ruleId, key.ruleId),
          ),
        )
        .returning();
      const updatedRule = updatedRules[0];
      if (!updatedRule) {
        throw new Error(
          `Failed to complete projection rule "${key.ruleId}" for wave "${waveId}"`,
        );
      }
      return parseWaveRule(updatedRule);
    });
  }

  public async getRuleMemo(
    input: GetProjectionRuleMemoInput,
  ): Promise<ProjectionRuleMemoValue | null> {
    const key = memoKeySchema.parse(input);
    const rows = await this.db
      .select()
      .from(projectionRuleMemos)
      .where(
        and(
          eq(projectionRuleMemos.ruleId, key.ruleId),
          eq(projectionRuleMemos.ruleVersion, key.ruleVersion),
          eq(projectionRuleMemos.inputFingerprint, key.inputFingerprint),
        ),
      )
      .limit(1);
    const memo = rows[0];
    if (!memo) return null;
    return {
      ...memo,
      writeIntents: z
        .array(ProjectionWriteIntentSchema)
        .parse(memo.writeIntents),
    };
  }
}
