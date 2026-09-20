import { and, asc, desc, eq, isNull, lte, ne, sql } from "drizzle-orm";
import { z } from "@brains/utils/zod";
import type { EntityDB } from "./db";
import type { ProjectionBatchCoordinator } from "./projection-batch-coordinator";
import {
  completionEffect,
  failureEffect,
  parseGraphFingerprint,
  parseWaveId,
  parseWaveTimestamp,
  parseProjectionIncidentInput,
  supersessionEffect,
  inputKey,
  type ProjectionIncidentDiagnostics,
  coalesceLatestInputs,
  type ClaimProjectionWaveInput,
  type FailedProjectionWave,
  type ProjectionIncidentInput,
} from "./projection-wave-contracts";
import {
  type EntityTransaction,
  type ProjectionTransactionRunner,
} from "./projection-transaction-runner";
import {
  projectionDirtyInputs,
  projectionIncidents,
  projectionWaveInputs,
  projectionWaveRules,
  projectionWaves,
  type ProjectionWave,
  type ProjectionWaveInput,
} from "./schema/projection-state";

export interface ProjectionWaveCoordinatorOptions {
  db: EntityDB;
  transactions: ProjectionTransactionRunner;
  batches: ProjectionBatchCoordinator;
}

/**
 * A projection wave from claim to terminal state.
 *
 * One wave runs at a time. Claiming takes every dirty input up to a cutoff
 * generation and moves it onto the wave, so the journal and the wave never
 * both own the same work; completing, failing and superseding are the three
 * ways that ownership is given back or closed out. Which of those is legal
 * from where is decided by projection-wave-contracts.
 *
 * requireWave, supersedeWaveInTransaction and getRecoveryGeneration are public
 * because the rule-result path and the batch coordinator ask the wave about
 * itself; everything else here is the lifecycle proper.
 */
export class ProjectionWaveCoordinator {
  private readonly db: EntityDB;
  private readonly transactions: ProjectionTransactionRunner;
  private readonly batches: ProjectionBatchCoordinator;

  constructor(options: ProjectionWaveCoordinatorOptions) {
    this.db = options.db;
    this.transactions = options.transactions;
    this.batches = options.batches;
  }

  public async claimPendingWave(
    input: ClaimProjectionWaveInput,
  ): Promise<ProjectionWave | null> {
    const waveId = parseWaveId(input.waveId);
    const graphFingerprint = parseGraphFingerprint(input.graphFingerprint);
    const startedAt = parseWaveTimestamp(input.startedAt);

    if (await this.batches.hasActiveBatch()) return null;

    return this.transactions.run(async (transaction) => {
      const active = await transaction
        .select({ id: projectionWaves.id })
        .from(projectionWaves)
        .where(eq(projectionWaves.status, "running"))
        .limit(1);
      if (active.length > 0) {
        throw new Error(
          `Cannot claim projection wave while "${active[0]?.id}" is running`,
        );
      }

      if (await this.batches.hasActiveBatchInTransaction(transaction)) {
        return null;
      }

      const admissionEpoch = await this.batches.getAdmissionEpoch(transaction);

      const latest = await transaction
        .select({ generation: projectionDirtyInputs.generation })
        .from(projectionDirtyInputs)
        .orderBy(desc(projectionDirtyInputs.generation))
        .limit(1);
      const cutoffGeneration = latest[0]?.generation;
      if (cutoffGeneration === undefined) return null;

      const wave: ProjectionWave = {
        id: waveId,
        cutoffGeneration,
        graphFingerprint,
        admissionEpoch,
        status: "running",
        startedAt,
        completedAt: null,
      };
      await transaction.insert(projectionWaves).values(wave);

      const journalRows = await transaction
        .select()
        .from(projectionDirtyInputs)
        .where(lte(projectionDirtyInputs.generation, cutoffGeneration))
        .orderBy(asc(projectionDirtyInputs.generation));
      const claimed = coalesceLatestInputs(journalRows);
      await transaction.insert(projectionWaveInputs).values(
        claimed.map((entry) => ({
          waveId,
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          revision: entry.revision,
          operation: entry.operation,
          generation: entry.generation,
        })),
      );
      await transaction
        .delete(projectionDirtyInputs)
        .where(lte(projectionDirtyInputs.generation, cutoffGeneration));

      return wave;
    });
  }

  public listWaveInputs(waveId: string): Promise<ProjectionWaveInput[]> {
    return this.db
      .select()
      .from(projectionWaveInputs)
      .where(eq(projectionWaveInputs.waveId, waveId))
      .orderBy(asc(projectionWaveInputs.generation));
  }

  public async getWave(waveId: string): Promise<ProjectionWave | null> {
    const parsedWaveId = parseWaveId(waveId);
    const rows = await this.db
      .select()
      .from(projectionWaves)
      .where(eq(projectionWaves.id, parsedWaveId))
      .limit(1);
    return rows[0] ?? null;
  }

  public async getActiveWave(): Promise<ProjectionWave | null> {
    const rows = await this.db
      .select()
      .from(projectionWaves)
      .where(eq(projectionWaves.status, "running"))
      .limit(1);
    return rows[0] ?? null;
  }

  public async requireWave(
    transaction: EntityTransaction,
    waveId: string,
  ): Promise<ProjectionWave> {
    const rows = await transaction
      .select()
      .from(projectionWaves)
      .where(eq(projectionWaves.id, waveId))
      .limit(1);
    const wave = rows[0];
    if (!wave) {
      throw new Error(`Projection wave "${waveId}" does not exist`);
    }
    return wave;
  }

  public async completeWave(
    waveId: string,
    completedAt: number,
  ): Promise<ProjectionWave> {
    const parsedWaveId = parseWaveId(waveId);
    const parsedCompletedAt = parseWaveTimestamp(completedAt);
    return this.transactions.run(async (transaction) => {
      const wave = await this.requireWave(transaction, parsedWaveId);
      const effect = completionEffect(wave.status);
      if (effect.kind === "settled") return wave;
      if (effect.kind === "refuse") {
        throw new Error(`Projection wave "${parsedWaveId}" ${effect.reason}`);
      }

      const incompleteRules = await transaction
        .select({ ruleId: projectionWaveRules.ruleId })
        .from(projectionWaveRules)
        .where(
          and(
            eq(projectionWaveRules.waveId, parsedWaveId),
            ne(projectionWaveRules.status, "completed"),
          ),
        )
        .limit(1);
      if (incompleteRules.length > 0) {
        throw new Error(
          `Projection wave "${parsedWaveId}" has incomplete projection rules`,
        );
      }

      const updated = await transaction
        .update(projectionWaves)
        .set({ status: "completed", completedAt: parsedCompletedAt })
        .where(eq(projectionWaves.id, parsedWaveId))
        .returning();
      const completedWave = updated[0];
      if (!completedWave) {
        throw new Error(
          `Failed to mark projection wave "${parsedWaveId}" completed`,
        );
      }
      await transaction
        .update(projectionIncidents)
        .set({ resolvedAt: parsedCompletedAt })
        .where(
          and(
            isNull(projectionIncidents.resolvedAt),
            lte(projectionIncidents.recoveryGeneration, wave.cutoffGeneration),
          ),
        );
      await this.batches.markRecoveredThrough(
        transaction,
        wave.cutoffGeneration,
        parsedCompletedAt,
      );
      return completedWave;
    });
  }

  public async supersedeWaveIfStale(
    waveId: string,
    supersededAt: number,
  ): Promise<boolean> {
    const parsedWaveId = parseWaveId(waveId);
    const parsedAt = parseWaveTimestamp(supersededAt);
    return this.transactions.run(async (transaction) => {
      const wave = await this.requireWave(transaction, parsedWaveId);
      const effect = supersessionEffect(wave.status);
      if (effect.kind === "settled") return true;
      if (effect.kind !== "apply") return false;
      const epoch = await this.batches.getAdmissionEpoch(transaction);
      if (wave.admissionEpoch === epoch) return false;
      await this.supersedeWaveInTransaction(transaction, wave, parsedAt);
      return true;
    });
  }

  public async failWave(
    waveId: string,
    failedAt: number,
  ): Promise<ProjectionWave> {
    const parsedWaveId = parseWaveId(waveId);
    const parsedFailedAt = parseWaveTimestamp(failedAt);
    return this.transactions.run(
      async (transaction) =>
        (
          await this.failWaveInTransaction(
            transaction,
            parsedWaveId,
            parsedFailedAt,
          )
        ).wave,
    );
  }

  public async failWaveWithIncident(
    input: ProjectionIncidentInput,
  ): Promise<ProjectionWave> {
    const parsed = parseProjectionIncidentInput(input);
    return this.transactions.run(async (transaction) => {
      const failure = await this.failWaveInTransaction(
        transaction,
        parsed.waveId,
        parsed.failedAt,
      );
      const updatedRules = await transaction
        .update(projectionWaveRules)
        .set({ status: "failed" })
        .where(
          and(
            eq(projectionWaveRules.waveId, parsed.waveId),
            eq(projectionWaveRules.ruleId, parsed.ruleId),
          ),
        )
        .returning({ ruleId: projectionWaveRules.ruleId });
      if (updatedRules.length === 0) {
        throw new Error(
          `Projection rule "${parsed.ruleId}" is not scheduled for wave "${parsed.waveId}"`,
        );
      }
      await transaction
        .insert(projectionIncidents)
        .values({
          waveId: parsed.waveId,
          ruleId: parsed.ruleId,
          jobId: parsed.jobId,
          failureReason: parsed.failureReason,
          recoveryGeneration: failure.recoveryGeneration,
          createdAt: parsed.failedAt,
          resolvedAt: null,
        })
        .onConflictDoNothing({ target: projectionIncidents.waveId });
      return failure.wave;
    });
  }

  public async getUnresolvedProjectionIncidentDiagnostics(
    limit: number = 10,
  ): Promise<ProjectionIncidentDiagnostics> {
    const parsedLimit = z.number().int().positive().max(100).parse(limit);
    const [countRows, incidents] = await Promise.all([
      this.db
        .select({ total: sql<number>`count(*)` })
        .from(projectionIncidents)
        .where(isNull(projectionIncidents.resolvedAt)),
      this.db
        .select()
        .from(projectionIncidents)
        .where(isNull(projectionIncidents.resolvedAt))
        .orderBy(desc(projectionIncidents.createdAt))
        .limit(parsedLimit),
    ]);
    return {
      total: Number(countRows[0]?.total ?? 0),
      incidents,
    };
  }

  private async failWaveInTransaction(
    transaction: EntityTransaction,
    waveId: string,
    failedAt: number,
  ): Promise<FailedProjectionWave> {
    const wave = await this.requireWave(transaction, waveId);
    const effect = failureEffect(wave.status);
    if (effect.kind === "refuse") {
      throw new Error(`Projection wave "${waveId}" ${effect.reason}`);
    }
    if (effect.kind === "settled") {
      // Already released its inputs. Requeueing them again would hand the
      // same work to a second wave.
      return {
        wave,
        recoveryGeneration: await this.getRecoveryGeneration(
          transaction,
          wave.cutoffGeneration,
        ),
      };
    }

    await this.requeueWaveInputs(transaction, waveId, failedAt);

    const recoveryGeneration = await this.getRecoveryGeneration(
      transaction,
      wave.cutoffGeneration,
    );
    const updated = await transaction
      .update(projectionWaves)
      .set({ status: "failed", completedAt: failedAt })
      .where(eq(projectionWaves.id, waveId))
      .returning();
    const failedWave = updated[0];
    if (!failedWave) {
      throw new Error(`Failed to mark projection wave "${waveId}" failed`);
    }
    return { wave: failedWave, recoveryGeneration };
  }

  public async supersedeWaveInTransaction(
    transaction: EntityTransaction,
    wave: ProjectionWave,
    supersededAt: number,
  ): Promise<ProjectionWave> {
    await this.requeueWaveInputs(transaction, wave.id, supersededAt);
    const updated = await transaction
      .update(projectionWaves)
      .set({ status: "superseded", completedAt: supersededAt })
      .where(
        and(
          eq(projectionWaves.id, wave.id),
          eq(projectionWaves.status, "running"),
        ),
      )
      .returning();
    return (
      updated[0] ?? { ...wave, status: "superseded", completedAt: supersededAt }
    );
  }

  private async requeueWaveInputs(
    transaction: EntityTransaction,
    waveId: string,
    markedAt: number,
  ): Promise<void> {
    const claimedInputs = await transaction
      .select()
      .from(projectionWaveInputs)
      .where(eq(projectionWaveInputs.waveId, waveId));
    const pendingInputs = await transaction
      .select()
      .from(projectionDirtyInputs);
    const pendingKeys = new Set(pendingInputs.map(inputKey));
    const requeued = claimedInputs.filter(
      (input) => !pendingKeys.has(inputKey(input)),
    );
    if (requeued.length === 0) return;
    await transaction.insert(projectionDirtyInputs).values(
      requeued.map((input) => ({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        revision: input.revision,
        operation: input.operation,
        markedAt,
      })),
    );
  }

  public async getRecoveryGeneration(
    transaction: EntityTransaction,
    fallback: number,
  ): Promise<number> {
    const rows = await transaction
      .select({
        generation: sql<
          number | null
        >`max(${projectionDirtyInputs.generation})`,
      })
      .from(projectionDirtyInputs);
    return Number(rows[0]?.generation ?? fallback);
  }
}
