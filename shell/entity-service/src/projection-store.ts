import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";
import { computeContentHash } from "@brains/utils/hash";
import { createId } from "@brains/utils/id";
import { SerialQueue } from "@brains/utils/serial-queue";
import { z } from "@brains/utils/zod";
import type { EntityDB } from "./db";
import type { EntityMutationAdmission } from "./mutation-admission";
import {
  ProjectionWriteIntentSchema,
  type ProjectionWriteIntent,
} from "./projection-contracts";
import {
  projectionAdmissionState,
  projectionBatchChildren,
  projectionBatches,
} from "./schema/projection-batches";
import {
  projectionDirtyInputs,
  projectionIncidents,
  projectionRuleMemos,
  projectionWaveInputs,
  projectionWaveRules,
  projectionWaves,
  type ProjectionChangedTarget,
  type ProjectionDirtyInput,
  type ProjectionIncident,
  type ProjectionRuleMemo,
  type ProjectionWave,
  type ProjectionWaveInput,
  type ProjectionWaveRule,
} from "./schema/projection-state";
import { entities } from "./schema/entities";

const dirtyInputSchema = z.strictObject({
  sourceType: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  revision: z.string().trim().min(1),
  operation: z.enum(["upsert", "delete"]),
  markedAt: z.number().int().nonnegative(),
});

const projectionIncidentInputSchema = z.strictObject({
  waveId: z.string().trim().min(1),
  ruleId: z.string().trim().min(1),
  jobId: z.string().trim().min(1).nullable(),
  failureReason: z.string().trim().min(1).max(500),
  failedAt: z.number().int().nonnegative(),
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

const bulkMutationInputSchema = z.strictObject({
  source: z.string().trim().min(1).max(100),
  operationId: z.string().trim().min(1).max(200),
});

const durableBulkMutationRootSchema = bulkMutationInputSchema.extend({
  rootJobId: z.string().trim().min(1).max(200),
  expectedChildren: z.number().int().positive().max(10_000),
});

const durableBulkMutationChildSchema = durableBulkMutationRootSchema.extend({
  rootJobId: z.string().trim().min(1).max(200),
  childKey: z.string().trim().min(1).max(200),
  expectedChildren: z.number().int().positive().max(10_000),
  jobId: z.string().trim().min(1).max(200),
});

const settleDurableBulkMutationChildSchema = z.strictObject({
  operationId: z.string().trim().min(1).max(200),
  childKey: z.string().trim().min(1).max(200),
  jobId: z.string().trim().min(1).max(200),
  outcome: z.enum(["completed", "failed"]),
});

const changedTargetSchema = z.strictObject({
  entityType: z.string().trim().min(1),
  entityId: z.string().trim().min(1),
  operation: z.enum(["upsert", "delete"]),
  contentHash: z.string().min(1).optional(),
});

export interface BulkMutationInput {
  source: string;
  operationId: string;
}

export interface DurableBulkMutationRootInput extends BulkMutationInput {
  rootJobId: string;
  expectedChildren: number;
}

export interface DurableBulkMutationChildInput extends DurableBulkMutationRootInput {
  childKey: string;
  jobId: string;
}

export interface SettleDurableBulkMutationChildInput {
  operationId: string;
  childKey: string;
  jobId: string;
  outcome: "completed" | "failed";
}

export class ProjectionBatchFencedError extends Error {}

interface ProjectionBatchScope {
  batchId: string;
  source: string;
  operationId: string;
  ownerToken: string;
}

export interface ProjectionBatchOwnedJob {
  jobId: string;
  childKey: string;
  status: "pending" | "processing" | "completed" | "failed";
}

export type ProjectionBatchRootReader = (
  rootJobId: string,
  operationId: string,
) => Promise<readonly ProjectionBatchOwnedJob[]>;

export interface ProjectionBatchRecoveryResult {
  fencedCallbacks: number;
  releasedDurableRoots: number;
}

export interface ProjectionBatchDiagnostics {
  preparing: number;
  open: number;
  abandoned: number;
  oldestActiveAgeMs: number | null;
  oldestProgressAgeMs: number | null;
}

export interface MarkProjectionDirtyInput {
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

export interface ProjectionIncidentInput {
  waveId: string;
  ruleId: string;
  jobId: string | null;
  failureReason: string;
  failedAt: number;
}

export interface ProjectionIncidentDiagnostics {
  total: number;
  incidents: ProjectionIncident[];
}

interface FailedProjectionWave {
  wave: ProjectionWave;
  recoveryGeneration: number;
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
  input: Pick<ProjectionDirtyInput, "sourceType" | "sourceId">,
): string {
  return `${input.sourceType}\u0000${input.sourceId}`;
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
  private readonly mutationAdmission: EntityMutationAdmission | undefined;
  private readonly now: () => number;
  private readonly transactionTail = new SerialQueue();
  private readonly batchScope = new AsyncLocalStorage<ProjectionBatchScope>();

  constructor(
    db: EntityDB,
    mutationAdmission?: EntityMutationAdmission,
    now: () => number = Date.now,
  ) {
    this.db = db;
    this.mutationAdmission = mutationAdmission;
    this.now = now;
  }

  public async runBulkMutation<TResult>(
    input: BulkMutationInput,
    mutation: () => Promise<TResult>,
  ): Promise<TResult> {
    const parsed = bulkMutationInputSchema.parse(input);
    const existingScope = this.batchScope.getStore();
    if (existingScope) return mutation();

    const scope = await this.openCallbackBatch(parsed);
    const heartbeat = setInterval(() => {
      void this.renewCallbackBatch(scope).catch(() => {
        // Mutation transactions enforce the fence if renewal loses ownership.
      });
    }, 10_000);
    heartbeat.unref();
    try {
      return await this.batchScope.run(scope, mutation);
    } finally {
      clearInterval(heartbeat);
      await this.closeCallbackBatch(scope);
    }
  }

  public async prepareDurableBulkMutation(
    input: DurableBulkMutationRootInput,
  ): Promise<void> {
    const parsed = durableBulkMutationRootSchema.parse(input);
    const now = this.now();
    await this.runTransaction(async (transaction) => {
      const existing = await transaction
        .select()
        .from(projectionBatches)
        .where(
          and(
            eq(projectionBatches.source, parsed.source),
            eq(projectionBatches.operationId, parsed.operationId),
          ),
        )
        .limit(1);
      const batch = existing[0];
      if (batch) {
        if (
          (batch.status === "preparing" || batch.status === "open") &&
          batch.rootJobId === parsed.rootJobId &&
          batch.expectedChildren === parsed.expectedChildren
        ) {
          return;
        }
        throw new ProjectionBatchFencedError(
          `Durable projection batch "${parsed.operationId}" cannot be prepared`,
        );
      }
      await transaction
        .insert(projectionAdmissionState)
        .values({ id: 1, epoch: 0 })
        .onConflictDoNothing({ target: projectionAdmissionState.id });
      await transaction
        .update(projectionAdmissionState)
        .set({ epoch: sql`${projectionAdmissionState.epoch} + 1` })
        .where(eq(projectionAdmissionState.id, 1));
      await transaction.insert(projectionBatches).values({
        id: createId(),
        source: parsed.source,
        operationId: parsed.operationId,
        status: "preparing",
        ownerKind: "job-root",
        ownerToken: createId(),
        rootJobId: parsed.rootJobId,
        expectedChildren: parsed.expectedChildren,
        enqueueComplete: 0,
        enqueueFailed: 0,
        openedAt: now,
        lastProgressAt: now,
        leaseExpiresAt: now + 30_000,
      });
    });
  }

  public async finalizeDurableBulkMutationEnqueue(
    operationId: string,
  ): Promise<void> {
    const parsedOperationId = z
      .string()
      .trim()
      .min(1)
      .max(200)
      .parse(operationId);
    const now = this.now();
    await this.db
      .update(projectionBatches)
      .set({
        status: "open",
        enqueueComplete: 1,
        lastProgressAt: now,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(projectionBatches.operationId, parsedOperationId),
          inArray(projectionBatches.status, ["preparing", "open"]),
        ),
      );
  }

  public async failDurableBulkMutationEnqueue(
    operationId: string,
  ): Promise<void> {
    const parsedOperationId = z
      .string()
      .trim()
      .min(1)
      .max(200)
      .parse(operationId);
    const now = this.now();
    await this.db
      .update(projectionBatches)
      .set({
        enqueueComplete: 1,
        enqueueFailed: 1,
        lastProgressAt: now,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(projectionBatches.operationId, parsedOperationId),
          inArray(projectionBatches.status, ["preparing", "open"]),
        ),
      );
  }

  public async runDurableBulkMutationChild<TResult>(
    input: DurableBulkMutationChildInput,
    mutation: () => Promise<TResult>,
  ): Promise<TResult> {
    const parsed = durableBulkMutationChildSchema.parse(input);
    const existingScope = this.batchScope.getStore();
    if (existingScope) return mutation();
    const scope = await this.openDurableBatchChild(parsed);
    return this.batchScope.run(scope, mutation);
  }

  public async settleDurableBulkMutationChild(
    input: SettleDurableBulkMutationChildInput,
  ): Promise<boolean> {
    const parsed = settleDurableBulkMutationChildSchema.parse(input);
    const now = this.now();
    return this.runTransaction(async (transaction) => {
      const batches = await transaction
        .select()
        .from(projectionBatches)
        .where(
          and(
            eq(projectionBatches.operationId, parsed.operationId),
            eq(projectionBatches.ownerKind, "job-root"),
          ),
        )
        .limit(1);
      const batch = batches[0];
      if (!batch || batch.status === "closed" || batch.status === "abandoned") {
        return false;
      }
      const updated = await transaction
        .update(projectionBatchChildren)
        .set({ status: parsed.outcome, terminalAt: now })
        .where(
          and(
            eq(projectionBatchChildren.batchId, batch.id),
            eq(projectionBatchChildren.childKey, parsed.childKey),
            eq(projectionBatchChildren.jobId, parsed.jobId),
          ),
        )
        .returning({ childKey: projectionBatchChildren.childKey });
      if (updated.length === 0) return false;

      const terminalRows = await transaction
        .select({ total: sql<number>`count(*)` })
        .from(projectionBatchChildren)
        .where(
          and(
            eq(projectionBatchChildren.batchId, batch.id),
            inArray(projectionBatchChildren.status, ["completed", "failed"]),
          ),
        );
      if (Number(terminalRows[0]?.total ?? 0) < batch.expectedChildren) {
        return false;
      }
      const failedRows = await transaction
        .select({ total: sql<number>`count(*)` })
        .from(projectionBatchChildren)
        .where(
          and(
            eq(projectionBatchChildren.batchId, batch.id),
            eq(projectionBatchChildren.status, "failed"),
          ),
        );
      const abandoned = Number(failedRows[0]?.total ?? 0) > 0;
      const recoveryGeneration = abandoned
        ? await this.getRecoveryGeneration(
            transaction,
            batch.highestGeneration ?? 0,
          )
        : null;
      await transaction
        .update(projectionBatches)
        .set({
          status: abandoned ? "abandoned" : "closed",
          terminalAt: now,
          lastProgressAt: now,
          leaseExpiresAt: null,
          recoveryGeneration,
          recoveredAt:
            abandoned && batch.highestGeneration === null ? now : null,
        })
        .where(eq(projectionBatches.id, batch.id));
      return true;
    });
  }

  public async recoverProjectionBatches(
    readRoot: ProjectionBatchRootReader,
  ): Promise<ProjectionBatchRecoveryResult> {
    const now = this.now();
    const fencedCallbacks = await this.runTransaction(async (transaction) => {
      const expired = await transaction
        .select()
        .from(projectionBatches)
        .where(
          and(
            eq(projectionBatches.ownerKind, "callback"),
            eq(projectionBatches.status, "open"),
            lte(projectionBatches.leaseExpiresAt, now),
          ),
        );
      for (const batch of expired) {
        const recoveryGeneration = await this.getRecoveryGeneration(
          transaction,
          batch.highestGeneration ?? 0,
        );
        await transaction
          .update(projectionBatches)
          .set({
            status: "abandoned",
            ownerToken: createId(),
            terminalAt: now,
            lastProgressAt: now,
            leaseExpiresAt: null,
            recoveryGeneration,
            recoveredAt: batch.highestGeneration === null ? now : null,
          })
          .where(
            and(
              eq(projectionBatches.id, batch.id),
              eq(projectionBatches.ownerToken, batch.ownerToken),
              eq(projectionBatches.status, "open"),
            ),
          );
      }
      return expired.length;
    });

    const durableBatches = await this.db
      .select()
      .from(projectionBatches)
      .where(
        and(
          eq(projectionBatches.ownerKind, "job-root"),
          inArray(projectionBatches.status, ["preparing", "open"]),
        ),
      );
    let releasedDurableRoots = 0;
    for (const batch of durableBatches) {
      if (!batch.rootJobId) continue;
      const jobs = await readRoot(batch.rootJobId, batch.operationId);
      const released = await this.reconcileDurableRoot(batch.id, jobs, now);
      if (released) releasedDurableRoots++;
    }
    await this.cleanupProjectionBatches();
    return { fencedCallbacks, releasedDurableRoots };
  }

  public async cleanupProjectionBatches(
    retentionMs: number = 7 * 24 * 60 * 60 * 1_000,
    maximumRecords: number = 100,
  ): Promise<number> {
    const parsedRetention = z.number().int().nonnegative().parse(retentionMs);
    const parsedMaximum = z
      .number()
      .int()
      .nonnegative()
      .max(10_000)
      .parse(maximumRecords);
    const terminalPredicate = or(
      eq(projectionBatches.status, "closed"),
      and(
        eq(projectionBatches.status, "abandoned"),
        isNotNull(projectionBatches.recoveredAt),
      ),
    );
    const expired = await this.db
      .select({ id: projectionBatches.id })
      .from(projectionBatches)
      .where(
        and(
          terminalPredicate,
          lte(projectionBatches.terminalAt, this.now() - parsedRetention),
        ),
      );
    const overflow = await this.db
      .select({ id: projectionBatches.id })
      .from(projectionBatches)
      .where(terminalPredicate)
      .orderBy(desc(projectionBatches.terminalAt))
      .limit(10_000)
      .offset(parsedMaximum);
    const ids = [...new Set([...expired, ...overflow].map(({ id }) => id))];
    if (ids.length === 0) return 0;
    const deleted = await this.db
      .delete(projectionBatches)
      .where(inArray(projectionBatches.id, ids))
      .returning({ id: projectionBatches.id });
    return deleted.length;
  }

  private async reconcileDurableRoot(
    batchId: string,
    jobs: readonly ProjectionBatchOwnedJob[],
    now: number,
  ): Promise<boolean> {
    return this.runTransaction(async (transaction) => {
      const batches = await transaction
        .select()
        .from(projectionBatches)
        .where(eq(projectionBatches.id, batchId))
        .limit(1);
      const batch = batches[0];
      if (!batch || (batch.status !== "open" && batch.status !== "preparing")) {
        return false;
      }
      for (const job of jobs) {
        const childStatus =
          job.status === "completed"
            ? "completed"
            : job.status === "failed"
              ? "failed"
              : "active";
        await transaction
          .insert(projectionBatchChildren)
          .values({
            batchId,
            childKey: job.childKey,
            jobId: job.jobId,
            status: childStatus,
            ...(childStatus === "completed" || childStatus === "failed"
              ? { terminalAt: now }
              : {}),
          })
          .onConflictDoUpdate({
            target: [
              projectionBatchChildren.batchId,
              projectionBatchChildren.childKey,
            ],
            set: {
              jobId: job.jobId,
              status: childStatus,
              terminalAt:
                childStatus === "completed" || childStatus === "failed"
                  ? now
                  : null,
            },
          });
      }

      const active = jobs.some(
        (job) => job.status === "pending" || job.status === "processing",
      );
      const completeRoot = jobs.length >= batch.expectedChildren && !active;
      const provablyPartial =
        !active &&
        jobs.length < batch.expectedChildren &&
        now - batch.openedAt >= 30_000;
      if (!completeRoot && !provablyPartial) return false;

      const abandoned =
        provablyPartial || jobs.some((job) => job.status === "failed");
      const recoveryGeneration = abandoned
        ? await this.getRecoveryGeneration(
            transaction,
            batch.highestGeneration ?? 0,
          )
        : null;
      await transaction
        .update(projectionBatches)
        .set({
          status: abandoned ? "abandoned" : "closed",
          ownerToken: abandoned ? createId() : batch.ownerToken,
          terminalAt: now,
          lastProgressAt: now,
          recoveryGeneration,
          recoveredAt:
            abandoned && batch.highestGeneration === null ? now : null,
        })
        .where(eq(projectionBatches.id, batchId));
      return true;
    });
  }

  public async getProjectionBatchDiagnostics(): Promise<ProjectionBatchDiagnostics> {
    const now = this.now();
    const rows = await this.db
      .select({
        status: projectionBatches.status,
        openedAt: projectionBatches.openedAt,
        lastProgressAt: projectionBatches.lastProgressAt,
        recoveredAt: projectionBatches.recoveredAt,
      })
      .from(projectionBatches)
      .where(
        inArray(projectionBatches.status, ["preparing", "open", "abandoned"]),
      );
    const active = rows.filter(
      (row) => row.status === "preparing" || row.status === "open",
    );
    return {
      preparing: rows.filter((row) => row.status === "preparing").length,
      open: rows.filter((row) => row.status === "open").length,
      abandoned: rows.filter(
        (row) => row.status === "abandoned" && row.recoveredAt === null,
      ).length,
      oldestActiveAgeMs:
        active.length === 0
          ? null
          : Math.max(0, now - Math.min(...active.map((row) => row.openedAt))),
      oldestProgressAgeMs:
        active.length === 0
          ? null
          : Math.max(
              0,
              now - Math.min(...active.map((row) => row.lastProgressAt)),
            ),
    };
  }

  private async openDurableBatchChild(
    input: DurableBulkMutationChildInput,
  ): Promise<ProjectionBatchScope> {
    const now = this.now();
    return this.runTransaction(async (transaction) => {
      let batch = (
        await transaction
          .select()
          .from(projectionBatches)
          .where(
            and(
              eq(projectionBatches.source, input.source),
              eq(projectionBatches.operationId, input.operationId),
            ),
          )
          .limit(1)
      )[0];
      if (!batch) {
        await transaction
          .insert(projectionAdmissionState)
          .values({ id: 1, epoch: 0 })
          .onConflictDoNothing({ target: projectionAdmissionState.id });
        await transaction
          .update(projectionAdmissionState)
          .set({ epoch: sql`${projectionAdmissionState.epoch} + 1` })
          .where(eq(projectionAdmissionState.id, 1));
        const inserted = await transaction
          .insert(projectionBatches)
          .values({
            id: createId(),
            source: input.source,
            operationId: input.operationId,
            status: "open",
            ownerKind: "job-root",
            ownerToken: createId(),
            rootJobId: input.rootJobId,
            expectedChildren: input.expectedChildren,
            enqueueComplete: 1,
            enqueueFailed: 0,
            openedAt: now,
            lastProgressAt: now,
          })
          .returning();
        batch = inserted[0];
      }
      if (
        (batch?.status !== "preparing" && batch?.status !== "open") ||
        batch.ownerKind !== "job-root" ||
        batch.rootJobId !== input.rootJobId ||
        batch.expectedChildren !== input.expectedChildren
      ) {
        throw new ProjectionBatchFencedError(
          `Durable projection batch "${input.operationId}" is not open for this owner`,
        );
      }

      const existingChildren = await transaction
        .select()
        .from(projectionBatchChildren)
        .where(
          and(
            eq(projectionBatchChildren.batchId, batch.id),
            eq(projectionBatchChildren.childKey, input.childKey),
          ),
        )
        .limit(1);
      const existingChild = existingChildren[0];
      if (
        existingChild &&
        (existingChild.status === "completed" ||
          existingChild.status === "failed" ||
          existingChild.status === "missing")
      ) {
        throw new ProjectionBatchFencedError(
          `Durable projection batch child "${input.childKey}" is terminal`,
        );
      }
      await transaction
        .insert(projectionBatchChildren)
        .values({
          batchId: batch.id,
          childKey: input.childKey,
          jobId: input.jobId,
          status: "active",
        })
        .onConflictDoUpdate({
          target: [
            projectionBatchChildren.batchId,
            projectionBatchChildren.childKey,
          ],
          set: { jobId: input.jobId, status: "active", terminalAt: null },
        });
      await transaction
        .update(projectionBatches)
        .set({ status: "open", lastProgressAt: now, leaseExpiresAt: null })
        .where(eq(projectionBatches.id, batch.id));
      return {
        batchId: batch.id,
        source: batch.source,
        operationId: batch.operationId,
        ownerToken: batch.ownerToken,
      };
    });
  }

  private async openCallbackBatch(
    input: BulkMutationInput,
  ): Promise<ProjectionBatchScope> {
    const scope: ProjectionBatchScope = {
      batchId: createId(),
      source: input.source,
      operationId: input.operationId,
      ownerToken: createId(),
    };
    const now = this.now();
    await this.runTransaction(async (transaction) => {
      await transaction
        .insert(projectionAdmissionState)
        .values({ id: 1, epoch: 0 })
        .onConflictDoNothing({ target: projectionAdmissionState.id });
      await transaction
        .update(projectionAdmissionState)
        .set({ epoch: sql`${projectionAdmissionState.epoch} + 1` })
        .where(eq(projectionAdmissionState.id, 1));
      await transaction.insert(projectionBatches).values({
        id: scope.batchId,
        source: scope.source,
        operationId: scope.operationId,
        status: "open",
        ownerKind: "callback",
        ownerToken: scope.ownerToken,
        expectedChildren: 0,
        enqueueComplete: 1,
        enqueueFailed: 0,
        openedAt: now,
        lastProgressAt: now,
        leaseExpiresAt: now + 30_000,
      });
    });
    return scope;
  }

  private async renewCallbackBatch(scope: ProjectionBatchScope): Promise<void> {
    const now = this.now();
    const rows = await this.db
      .update(projectionBatches)
      .set({ lastProgressAt: now, leaseExpiresAt: now + 30_000 })
      .where(
        and(
          eq(projectionBatches.id, scope.batchId),
          eq(projectionBatches.ownerToken, scope.ownerToken),
          eq(projectionBatches.status, "open"),
        ),
      )
      .returning({ id: projectionBatches.id });
    if (rows.length === 0) {
      throw new ProjectionBatchFencedError(
        `Projection batch "${scope.batchId}" no longer owns its fence`,
      );
    }
  }

  private async closeCallbackBatch(scope: ProjectionBatchScope): Promise<void> {
    const now = this.now();
    await this.db
      .update(projectionBatches)
      .set({
        status: "closed",
        terminalAt: now,
        lastProgressAt: now,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(projectionBatches.id, scope.batchId),
          eq(projectionBatches.ownerToken, scope.ownerToken),
          eq(projectionBatches.status, "open"),
        ),
      );
  }

  private async assertBatchScope(
    transaction: EntityTransaction,
    scope: ProjectionBatchScope,
  ): Promise<void> {
    const rows = await transaction
      .select({ status: projectionBatches.status })
      .from(projectionBatches)
      .where(
        and(
          eq(projectionBatches.id, scope.batchId),
          eq(projectionBatches.ownerToken, scope.ownerToken),
        ),
      )
      .limit(1);
    if (rows[0]?.status !== "open") {
      throw new ProjectionBatchFencedError(
        `Projection batch "${scope.batchId}" no longer owns its fence`,
      );
    }
  }

  private async recordBatchGeneration(
    transaction: EntityTransaction,
    scope: ProjectionBatchScope,
    generation: number,
  ): Promise<void> {
    const now = this.now();
    // assertBatchScope already validated this owner in the same write
    // transaction, so recovery cannot fence it between validation and update.
    await transaction
      .update(projectionBatches)
      .set({
        firstGeneration: sql`coalesce(${projectionBatches.firstGeneration}, ${generation})`,
        highestGeneration: generation,
        mutationCount: sql`${projectionBatches.mutationCount} + 1`,
        lastProgressAt: now,
        leaseExpiresAt: now + 30_000,
      })
      .where(
        and(
          eq(projectionBatches.id, scope.batchId),
          eq(projectionBatches.ownerToken, scope.ownerToken),
          eq(projectionBatches.status, "open"),
        ),
      );
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
    const scope = this.batchScope.getStore();
    return this.runTransaction(async (transaction) => {
      if (scope) await this.assertBatchScope(transaction, scope);
      const result = await mutation(transaction);
      const rows = await transaction
        .insert(projectionDirtyInputs)
        .values(parsed)
        .returning({ generation: projectionDirtyInputs.generation });
      const generation = rows[0]?.generation;
      if (generation === undefined) {
        throw new Error("Failed to persist projection dirty input");
      }
      if (scope) {
        await this.recordBatchGeneration(transaction, scope, generation);
      }
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

    return this.runTransaction(async (transaction) => {
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

      const barriers = await transaction
        .select({ id: projectionBatches.id })
        .from(projectionBatches)
        .where(inArray(projectionBatches.status, ["preparing", "open"]))
        .limit(1);
      if (barriers.length > 0) return null;

      await transaction
        .insert(projectionAdmissionState)
        .values({ id: 1, epoch: 0 })
        .onConflictDoNothing({ target: projectionAdmissionState.id });
      const admissionRows = await transaction
        .select({ epoch: projectionAdmissionState.epoch })
        .from(projectionAdmissionState)
        .where(eq(projectionAdmissionState.id, 1))
        .limit(1);
      const admissionEpoch = admissionRows[0]?.epoch ?? 0;

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
    const parsedWaveId = z.string().trim().min(1).parse(waveId);
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

  public async completeWave(
    waveId: string,
    completedAt: number,
  ): Promise<ProjectionWave> {
    const parsedWaveId = z.string().trim().min(1).parse(waveId);
    const parsedCompletedAt = z.number().int().nonnegative().parse(completedAt);
    return this.runTransaction(async (transaction) => {
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
      if (wave.status === "superseded") {
        throw new Error(`Projection wave "${parsedWaveId}" was superseded`);
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
      await transaction
        .update(projectionBatches)
        .set({ recoveredAt: parsedCompletedAt })
        .where(
          and(
            eq(projectionBatches.status, "abandoned"),
            isNull(projectionBatches.recoveredAt),
            lte(projectionBatches.recoveryGeneration, wave.cutoffGeneration),
          ),
        );
      return completedWave;
    });
  }

  public async supersedeWaveIfStale(
    waveId: string,
    supersededAt: number,
  ): Promise<boolean> {
    const parsedWaveId = z.string().trim().min(1).parse(waveId);
    const parsedAt = z.number().int().nonnegative().parse(supersededAt);
    return this.runTransaction(async (transaction) => {
      const waveRows = await transaction
        .select()
        .from(projectionWaves)
        .where(eq(projectionWaves.id, parsedWaveId))
        .limit(1);
      const wave = waveRows[0];
      if (!wave) {
        throw new Error(`Projection wave "${parsedWaveId}" does not exist`);
      }
      if (wave.status === "superseded") return true;
      if (wave.status !== "running") return false;
      const epoch = await this.getAdmissionEpoch(transaction);
      if (wave.admissionEpoch === epoch) return false;
      await this.supersedeWaveInTransaction(transaction, wave, parsedAt);
      return true;
    });
  }

  public async failWave(
    waveId: string,
    failedAt: number,
  ): Promise<ProjectionWave> {
    const parsedWaveId = z.string().trim().min(1).parse(waveId);
    const parsedFailedAt = z.number().int().nonnegative().parse(failedAt);
    return this.runTransaction(
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
    const parsed = projectionIncidentInputSchema.parse(input);
    return this.runTransaction(async (transaction) => {
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
    const waveRows = await transaction
      .select()
      .from(projectionWaves)
      .where(eq(projectionWaves.id, waveId))
      .limit(1);
    const wave = waveRows[0];
    if (!wave) {
      throw new Error(`Projection wave "${waveId}" does not exist`);
    }
    if (wave.status === "completed") {
      throw new Error(`Projection wave "${waveId}" already completed`);
    }
    if (wave.status === "superseded") {
      return {
        wave,
        recoveryGeneration: await this.getRecoveryGeneration(
          transaction,
          wave.cutoffGeneration,
        ),
      };
    }
    if (wave.status === "failed") {
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

  private async supersedeWaveInTransaction(
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

  private async getAdmissionEpoch(
    transaction: EntityTransaction,
  ): Promise<number> {
    await transaction
      .insert(projectionAdmissionState)
      .values({ id: 1, epoch: 0 })
      .onConflictDoNothing({ target: projectionAdmissionState.id });
    const rows = await transaction
      .select({ epoch: projectionAdmissionState.epoch })
      .from(projectionAdmissionState)
      .where(eq(projectionAdmissionState.id, 1))
      .limit(1);
    return rows[0]?.epoch ?? 0;
  }

  private async getRecoveryGeneration(
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

    return this.runTransaction(async (transaction) => {
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

      const waveRows = await transaction
        .select()
        .from(projectionWaves)
        .where(eq(projectionWaves.id, waveId))
        .limit(1);
      const wave = waveRows[0];
      if (!wave) throw new Error(`Projection wave "${waveId}" does not exist`);
      if (wave.status === "superseded") return null;
      if (wave.status !== "running") {
        throw new Error(`Projection wave "${waveId}" is not running`);
      }
      const admissionEpoch = await this.getAdmissionEpoch(transaction);
      if (wave.admissionEpoch !== admissionEpoch) {
        await this.supersedeWaveInTransaction(transaction, wave, completedAt);
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

  private async runTransaction<TResult>(
    transaction: (database: EntityTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.transactionTail.run(() => this.db.transaction(transaction));
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
      await this.mutationAdmission?.assertMutationAdmission({
        operation: "delete",
        entityType,
        entityId,
      });
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

    await this.mutationAdmission?.assertMutationAdmission({
      operation: existing ? "update" : "create",
      entityType,
      entityId,
    });

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
