import { and, asc, desc, eq, lte, ne, sql } from "drizzle-orm";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import type { EntityDB } from "./db";
import {
  ProjectionWriteIntentSchema,
  type ProjectionWriteIntent,
} from "./projection-contracts";
import {
  projectionDirtyInputs,
  projectionRuleMemos,
  projectionWaveInputs,
  projectionWaveRules,
  projectionWaves,
  type ProjectionChangedTarget,
  type ProjectionDirtyInput,
  type ProjectionRuleMemo,
  type ProjectionWave,
  type ProjectionWaveInput,
  type ProjectionWaveRule,
} from "./schema/projection-state";
import { entities } from "./schema/entities";

const dirtyInputSchema = z.strictObject({
  kind: z.enum(["entity", "rule"]),
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

export interface MarkProjectionDirtyInput {
  kind: "entity" | "rule";
  sourceType: string;
  sourceId: string;
  revision: string;
  operation: "upsert" | "delete";
  markedAt: number;
}

export interface ClaimProjectionWaveInput {
  waveId: string;
  graphFingerprint: string;
  startedAt: number;
}

export interface GetProjectionRuleMemoInput {
  ruleId: string;
  ruleVersion: string;
  inputFingerprint: string;
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

type EntityTransaction = Parameters<Parameters<EntityDB["transaction"]>[0]>[0];

function inputKey(
  input: Pick<ProjectionDirtyInput, "kind" | "sourceType" | "sourceId">,
): string {
  return `${input.kind}\u0000${input.sourceType}\u0000${input.sourceId}`;
}

function coalesceLatestInputs(
  inputs: readonly ProjectionDirtyInput[],
): ProjectionDirtyInput[] {
  const latestBySource = new Map<string, ProjectionDirtyInput>();
  for (const input of inputs) {
    latestBySource.set(inputKey(input), input);
  }
  return [...latestBySource.values()].sort(
    (left, right) => left.generation - right.generation,
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseWaveRule(rule: ProjectionWaveRule): ProjectionWaveRule {
  const changedTargets: ProjectionChangedTarget[] = z
    .array(changedTargetSchema)
    .parse(rule.changedTargets);
  return { ...rule, changedTargets };
}

/** Entity-database persistence boundary for scheduler coordination state. */
export class ProjectionStore {
  private readonly db: EntityDB;

  constructor(db: EntityDB) {
    this.db = db;
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
    return this.db.transaction(async (transaction) => {
      const result = await mutation(transaction);
      await transaction.insert(projectionDirtyInputs).values(parsed);
      return result;
    });
  }

  public async listPendingInputs(): Promise<ProjectionDirtyInput[]> {
    const inputs = await this.db
      .select()
      .from(projectionDirtyInputs)
      .orderBy(asc(projectionDirtyInputs.generation));
    return coalesceLatestInputs(inputs);
  }

  public async claimPendingWave(
    input: ClaimProjectionWaveInput,
  ): Promise<ProjectionWave | null> {
    const waveId = z.string().trim().min(1).parse(input.waveId);
    const graphFingerprint = z
      .string()
      .trim()
      .min(1)
      .parse(input.graphFingerprint);
    const startedAt = z.number().int().nonnegative().parse(input.startedAt);

    return this.db.transaction(async (transaction) => {
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
          kind: entry.kind,
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

  public async getActiveWave(): Promise<ProjectionWave | null> {
    const rows = await this.db
      .select()
      .from(projectionWaves)
      .where(eq(projectionWaves.status, "running"))
      .limit(1);
    return rows[0] ?? null;
  }

  public async completeWave(
    waveId: string,
    completedAt: number,
  ): Promise<ProjectionWave> {
    const parsedWaveId = z.string().trim().min(1).parse(waveId);
    const parsedCompletedAt = z.number().int().nonnegative().parse(completedAt);
    return this.db.transaction(async (transaction) => {
      const waveRows = await transaction
        .select()
        .from(projectionWaves)
        .where(eq(projectionWaves.id, parsedWaveId))
        .limit(1);
      const wave = waveRows[0];
      if (!wave) {
        throw new Error(`Projection wave "${parsedWaveId}" does not exist`);
      }
      if (wave.status === "completed") return wave;
      if (wave.status === "failed") {
        throw new Error(`Projection wave "${parsedWaveId}" already failed`);
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
      return completedWave;
    });
  }

  public async failWave(
    waveId: string,
    failedAt: number,
  ): Promise<ProjectionWave> {
    const parsedWaveId = z.string().trim().min(1).parse(waveId);
    const parsedFailedAt = z.number().int().nonnegative().parse(failedAt);
    return this.db.transaction(async (transaction) => {
      const waveRows = await transaction
        .select()
        .from(projectionWaves)
        .where(eq(projectionWaves.id, parsedWaveId))
        .limit(1);
      const wave = waveRows[0];
      if (!wave) {
        throw new Error(`Projection wave "${parsedWaveId}" does not exist`);
      }
      if (wave.status === "completed") {
        throw new Error(`Projection wave "${parsedWaveId}" already completed`);
      }
      if (wave.status === "failed") return wave;

      const claimedInputs = await transaction
        .select()
        .from(projectionWaveInputs)
        .where(eq(projectionWaveInputs.waveId, parsedWaveId));
      const pendingInputs = await transaction
        .select()
        .from(projectionDirtyInputs);
      const pendingKeys = new Set(pendingInputs.map(inputKey));
      const requeued = claimedInputs.filter(
        (input) => !pendingKeys.has(inputKey(input)),
      );
      if (requeued.length > 0) {
        await transaction.insert(projectionDirtyInputs).values(
          requeued.map((input) => ({
            kind: input.kind,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            revision: input.revision,
            operation: input.operation,
            markedAt: parsedFailedAt,
          })),
        );
      }

      const updated = await transaction
        .update(projectionWaves)
        .set({ status: "failed", completedAt: parsedFailedAt })
        .where(eq(projectionWaves.id, parsedWaveId))
        .returning();
      const failedWave = updated[0];
      if (!failedWave) {
        throw new Error(
          `Failed to mark projection wave "${parsedWaveId}" failed`,
        );
      }
      return failedWave;
    });
  }

  public async putWaveRules(
    waveId: string,
    rules: readonly ProjectionWaveRuleInput[],
  ): Promise<void> {
    const parsedWaveId = z.string().trim().min(1).parse(waveId);
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
    const parsedWaveId = z.string().trim().min(1).parse(waveId);
    const parsedRuleId = z.string().trim().min(1).parse(ruleId);
    const parsedJobId = z.string().trim().min(1).parse(jobId);
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
    if (current?.status === "queued" && current.jobId === parsedJobId) {
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
  ): Promise<ProjectionWaveRule> {
    const waveId = z.string().trim().min(1).parse(input.waveId);
    const key = memoKeySchema.parse({
      ruleId: input.ruleId,
      ruleVersion: input.ruleVersion,
      inputFingerprint: input.inputFingerprint,
    });
    const writeIntents = z
      .array(ProjectionWriteIntentSchema)
      .parse(input.writeIntents);
    const completedAt = z.number().int().nonnegative().parse(input.completedAt);

    return this.db.transaction(async (transaction) => {
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

      const waveRows = await transaction
        .select({ status: projectionWaves.status })
        .from(projectionWaves)
        .where(eq(projectionWaves.id, waveId))
        .limit(1);
      if (waveRows[0]?.status !== "running") {
        throw new Error(`Projection wave "${waveId}" is not running`);
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
        canonicalJson(existingMemo.writeIntents) !== canonicalJson(writeIntents)
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

      const changedTargets = await writeIntents.reduce<
        Promise<ProjectionChangedTarget[]>
      >(async (pendingTargets, intent) => {
        const targets = await pendingTargets;
        const target = await this.applyWriteIntent(
          transaction,
          intent,
          completedAt,
        );
        return target ? [...targets, target] : targets;
      }, Promise.resolve([]));

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

  private async applyWriteIntent(
    transaction: EntityTransaction,
    intent: ProjectionWriteIntent,
    changedAt: number,
  ): Promise<ProjectionChangedTarget | null> {
    const entityType =
      intent.operation === "upsert"
        ? intent.entity.entityType
        : intent.entityType;
    const entityId =
      intent.operation === "upsert" ? intent.entity.id : intent.id;
    const existingRows = await transaction
      .select({
        content: entities.content,
        contentHash: entities.contentHash,
        metadata: entities.metadata,
        visibility: entities.visibility,
      })
      .from(entities)
      .where(
        and(eq(entities.entityType, entityType), eq(entities.id, entityId)),
      )
      .limit(1);
    const existing = existingRows[0];

    if (intent.operation === "delete") {
      if (!existing) return null;
      await transaction
        .delete(entities)
        .where(
          and(eq(entities.entityType, entityType), eq(entities.id, entityId)),
        );
      await transaction.run(
        sql`DELETE FROM entity_fts WHERE entity_id = ${entityId} AND entity_type = ${entityType}`,
      );
      return { entityType, entityId, operation: "delete" };
    }

    const contentHash = computeContentHash(intent.entity.content);
    if (
      existing?.contentHash === contentHash &&
      existing.content === intent.entity.content &&
      existing.visibility === intent.entity.visibility &&
      canonicalJson(existing.metadata) === canonicalJson(intent.entity.metadata)
    ) {
      return null;
    }

    if (existing) {
      await transaction
        .update(entities)
        .set({
          content: intent.entity.content,
          contentHash,
          metadata: intent.entity.metadata,
          visibility: intent.entity.visibility,
          updated: changedAt,
        })
        .where(
          and(eq(entities.entityType, entityType), eq(entities.id, entityId)),
        );
    } else {
      await transaction.insert(entities).values({
        id: entityId,
        entityType,
        content: intent.entity.content,
        contentHash,
        metadata: intent.entity.metadata,
        visibility: intent.entity.visibility,
        created: changedAt,
        updated: changedAt,
      });
    }

    await transaction.run(
      sql`DELETE FROM entity_fts WHERE entity_id = ${entityId} AND entity_type = ${entityType}`,
    );
    await transaction.run(
      sql`INSERT INTO entity_fts (entity_id, entity_type, content) VALUES (${entityId}, ${entityType}, ${intent.entity.content})`,
    );
    return {
      entityType,
      entityId,
      operation: "upsert",
      contentHash,
    };
  }
}
