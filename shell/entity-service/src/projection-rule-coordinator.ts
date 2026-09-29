import { and, asc, eq } from "drizzle-orm";
import { z } from "@brains/utils/zod";
import type { EntityDB } from "./db";
import type { ProjectionBatchCoordinator } from "./projection-batch-coordinator";
import { ProjectionWriteIntentSchema } from "./projection-contracts";
import type { ProjectionTransactionRunner } from "./projection-transaction-runner";
import {
  parseRuleMemoKey,
  parseWaveRule,
  parseWaveRuleInputs,
  type ApplyProjectionRuleResultInput,
  type GetProjectionRuleMemoInput,
  type ProjectionRuleMemoValue,
  type ProjectionWaveRuleInput,
} from "./projection-rule-contracts";
import {
  parseJobId,
  parseRuleId,
  parseWaveId,
  parseWaveTimestamp,
  ruleReportEffect,
} from "./projection-wave-contracts";
import type { ProjectionWaveCoordinator } from "./projection-wave-coordinator";
import {
  canonicalProjectionJson,
  type ProjectionWriteIntentApplier,
} from "./projection-write-intent-applier";
import {
  projectionRuleMemos,
  projectionWaveRules,
  type ProjectionWaveRule,
} from "./schema/projection-state";

export interface ProjectionRuleCoordinatorOptions {
  db: EntityDB;
  transactions: ProjectionTransactionRunner;
  batches: ProjectionBatchCoordinator;
  waves: ProjectionWaveCoordinator;
  writeIntentApplier: ProjectionWriteIntentApplier;
}

/**
 * The rules scheduled into a wave, and what happens when one reports back.
 *
 * A rule's result is only admitted while the wave it belongs to is still
 * running and the admission epoch has not moved under it — otherwise the work
 * is stale and the wave is superseded instead. That check is the reason this
 * needs the wave coordinator rather than owning the wave itself.
 */
export class ProjectionRuleCoordinator {
  private readonly db: EntityDB;
  private readonly transactions: ProjectionTransactionRunner;
  private readonly batches: ProjectionBatchCoordinator;
  private readonly waves: ProjectionWaveCoordinator;
  private readonly writeIntentApplier: ProjectionWriteIntentApplier;

  constructor(options: ProjectionRuleCoordinatorOptions) {
    this.db = options.db;
    this.transactions = options.transactions;
    this.batches = options.batches;
    this.waves = options.waves;
    this.writeIntentApplier = options.writeIntentApplier;
  }

  public async putWaveRules(
    waveId: string,
    rules: readonly ProjectionWaveRuleInput[],
  ): Promise<void> {
    const parsedWaveId = parseWaveId(waveId);
    const parsedRules = parseWaveRuleInputs(rules);
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
    const key = parseRuleMemoKey({
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

      const changedTargets = await this.writeIntentApplier.applyAll(
        transaction,
        writeIntents,
        completedAt,
        key,
      );

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
    const key = parseRuleMemoKey(input);
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
