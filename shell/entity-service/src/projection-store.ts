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
import { ProjectionRuleCoordinator } from "./projection-rule-coordinator";
export type {
  ApplyProjectionRuleResultInput,
  GetProjectionRuleMemoInput,
  ProjectionRuleMemoValue,
  ProjectionWaveRuleInput,
} from "./projection-rule-contracts";
import type {
  ApplyProjectionRuleResultInput,
  GetProjectionRuleMemoInput,
  ProjectionRuleMemoValue,
  ProjectionWaveRuleInput,
} from "./projection-rule-contracts";
import { ProjectionWaveCoordinator } from "./projection-wave-coordinator";
import {
  coalesceLatestInputs,
  type ClaimProjectionWaveInput,
  type ProjectionIncidentDiagnostics,
  type ProjectionIncidentInput,
} from "./projection-wave-contracts";
import {
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
  type ProjectionDirtyInput,
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

const projectionOwnedEntitySchema = z.strictObject({
  entityType: z.string().trim().min(1),
  id: z.string().trim().min(1),
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

export interface ProjectionOwnedEntityInput {
  entityType: string;
  id: string;
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
  private readonly rules: ProjectionRuleCoordinator;

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
    this.rules = new ProjectionRuleCoordinator({
      db,
      transactions: this.transactions,
      batches: this.batches,
      waves: this.waves,
      writeIntentApplier: this.writeIntentApplier,
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

  public putWaveRules(
    waveId: string,
    rules: readonly ProjectionWaveRuleInput[],
  ): Promise<void> {
    return this.rules.putWaveRules(waveId, rules);
  }

  public listWaveRules(waveId: string): Promise<ProjectionWaveRule[]> {
    return this.rules.listWaveRules(waveId);
  }

  public queueWaveRule(
    waveId: string,
    ruleId: string,
    jobId: string,
  ): Promise<ProjectionWaveRule> {
    return this.rules.queueWaveRule(waveId, ruleId, jobId);
  }

  public getWaveRule(
    waveId: string,
    ruleId: string,
  ): Promise<ProjectionWaveRule | null> {
    return this.rules.getWaveRule(waveId, ruleId);
  }

  public applyRuleResult(
    input: ApplyProjectionRuleResultInput,
  ): Promise<ProjectionWaveRule | null> {
    return this.rules.applyRuleResult(input);
  }

  public getRuleMemo(
    input: GetProjectionRuleMemoInput,
  ): Promise<ProjectionRuleMemoValue | null> {
    return this.rules.getRuleMemo(input);
  }
}
