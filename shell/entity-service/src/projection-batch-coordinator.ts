import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";
import { createId } from "@brains/utils/id";
import { z } from "@brains/utils/zod";
import type { EntityDB } from "./db";
import {
  parseBulkMutationInput,
  parseDurableBulkMutationChildInput,
  parseDurableBulkMutationRootInput,
  parseSettleDurableBulkMutationChildInput,
  type BulkMutationInput,
  type DurableBulkMutationChildInput,
  type DurableBulkMutationRootInput,
  type ProjectionBatchOwnedJob,
  type ProjectionBatchRecoveryResult,
  type ProjectionBatchRootReader,
  type SettleDurableBulkMutationChildInput,
} from "./projection-batch-contracts";
import {
  projectionAdmissionState,
  projectionBatchChildren,
  projectionBatches,
  type ProjectionBatch,
} from "./schema/projection-batches";
import type {
  EntityTransaction,
  ProjectionTransactionRunner,
} from "./projection-transaction-runner";

const DURABLE_ROOT_RECOVERY_GRACE_MS = 5_000;
const DURABLE_ROOT_PARTIAL_TIMEOUT_MS = 30_000;
const PROJECTION_BATCH_LEASE_MS = 30_000;
const CALLBACK_BATCH_HEARTBEAT_MS = 10_000;

export class ProjectionBatchFencedError extends Error {}

interface ProjectionBatchScope {
  batchId: string;
  source: string;
  operationId: string;
  ownerToken: string;
}

interface TerminalProjectionBatchTransition {
  abandoned: boolean;
  terminalAt: number;
  fenceOwner: boolean;
  clearLease: boolean;
}

export interface ProjectionBatchDiagnostics {
  preparing: number;
  open: number;
  abandoned: number;
  expiredCallbackLeases: number;
  oldestActiveAgeMs: number | null;
  oldestProgressAgeMs: number | null;
}

interface ProjectionBatchCoordinatorOptions {
  db: EntityDB;
  transactions: ProjectionTransactionRunner;
  now: () => number;
  getRecoveryGeneration: (
    transaction: EntityTransaction,
    fallback: number,
  ) => Promise<number>;
}

/** Owns durable and callback projection-batch admission and recovery. */
export class ProjectionBatchCoordinator {
  private readonly db: EntityDB;
  private readonly transactions: ProjectionTransactionRunner;
  private readonly now: () => number;
  private readonly readRecoveryGeneration: ProjectionBatchCoordinatorOptions["getRecoveryGeneration"];
  private readonly batchScope = new AsyncLocalStorage<ProjectionBatchScope>();

  public constructor(options: ProjectionBatchCoordinatorOptions) {
    this.db = options.db;
    this.transactions = options.transactions;
    this.now = options.now;
    this.readRecoveryGeneration = options.getRecoveryGeneration;
  }

  private assertBatchIdentity(
    scope: ProjectionBatchScope,
    input: BulkMutationInput,
  ): void {
    if (
      scope.source !== input.source ||
      scope.operationId !== input.operationId
    ) {
      throw new ProjectionBatchFencedError(
        `Projection batch "${input.operationId}" cannot join active batch "${scope.operationId}"`,
      );
    }
  }

  public async runBulkMutation<TResult>(
    input: BulkMutationInput,
    mutation: () => Promise<TResult>,
  ): Promise<TResult> {
    const parsed = parseBulkMutationInput(input);
    const existingScope = this.batchScope.getStore();
    if (existingScope) {
      this.assertBatchIdentity(existingScope, parsed);
      return mutation();
    }

    const scope = await this.openCallbackBatch(parsed);
    const heartbeat = setInterval(() => {
      void this.renewCallbackBatch(scope).catch(() => {
        // Mutation transactions enforce the fence if renewal loses ownership.
      });
    }, CALLBACK_BATCH_HEARTBEAT_MS);
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
    const parsed = parseDurableBulkMutationRootInput(input);
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
        leaseExpiresAt: now + PROJECTION_BATCH_LEASE_MS,
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
    await this.runBatchStateWrite(() =>
      this.db
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
    await this.runBatchStateWrite(() =>
      this.db
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
        ),
    );
  }

  public async runDurableBulkMutationChild<TResult>(
    input: DurableBulkMutationChildInput,
    mutation: () => Promise<TResult>,
  ): Promise<TResult> {
    const parsed = parseDurableBulkMutationChildInput(input);
    const existingScope = this.batchScope.getStore();
    if (existingScope) {
      this.assertBatchIdentity(existingScope, parsed);
      return mutation();
    }
    const scope = await this.openDurableBatchChild(parsed);
    return this.batchScope.run(scope, mutation);
  }

  public async settleDurableBulkMutationChild(
    input: SettleDurableBulkMutationChildInput,
  ): Promise<boolean> {
    const parsed = parseSettleDurableBulkMutationChildInput(input);
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
      await this.transitionProjectionBatchToTerminal(transaction, batch, {
        abandoned,
        terminalAt: now,
        fenceOwner: false,
        clearLease: true,
      });
      return true;
    });
  }

  public async recoverProjectionBatches(
    readRoot: ProjectionBatchRootReader,
  ): Promise<ProjectionBatchRecoveryResult> {
    const now = this.now();
    const expiredCallbackCandidates = await this.db
      .select({ id: projectionBatches.id })
      .from(projectionBatches)
      .where(
        and(
          eq(projectionBatches.ownerKind, "callback"),
          eq(projectionBatches.status, "open"),
          lte(projectionBatches.leaseExpiresAt, now),
        ),
      );
    const fencedCallbacks =
      expiredCallbackCandidates.length === 0
        ? 0
        : await this.runTransaction(async (transaction) => {
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
      const hasActiveJob = jobs.some(
        (job) => job.status === "pending" || job.status === "processing",
      );
      const terminalRecoveryReady = jobs.every(
        (job) =>
          job.terminalAt !== null &&
          job.terminalAt <= now - DURABLE_ROOT_RECOVERY_GRACE_MS,
      );
      const completeRoot = jobs.length >= batch.expectedChildren;
      const provablyPartial =
        now - batch.openedAt >= DURABLE_ROOT_PARTIAL_TIMEOUT_MS;
      if (
        hasActiveJob ||
        !terminalRecoveryReady ||
        (!completeRoot && !provablyPartial)
      ) {
        continue;
      }
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
        now - batch.openedAt >= DURABLE_ROOT_PARTIAL_TIMEOUT_MS;
      if (!completeRoot && !provablyPartial) return false;

      const abandoned =
        provablyPartial || jobs.some((job) => job.status === "failed");
      await this.transitionProjectionBatchToTerminal(transaction, batch, {
        abandoned,
        terminalAt: now,
        fenceOwner: true,
        clearLease: false,
      });
      return true;
    });
  }

  private async transitionProjectionBatchToTerminal(
    transaction: EntityTransaction,
    batch: ProjectionBatch,
    transition: TerminalProjectionBatchTransition,
  ): Promise<void> {
    const recoveryGeneration = transition.abandoned
      ? await this.getRecoveryGeneration(
          transaction,
          batch.highestGeneration ?? 0,
        )
      : null;
    await transaction
      .update(projectionBatches)
      .set({
        status: transition.abandoned ? "abandoned" : "closed",
        ownerToken:
          transition.abandoned && transition.fenceOwner
            ? createId()
            : batch.ownerToken,
        terminalAt: transition.terminalAt,
        lastProgressAt: transition.terminalAt,
        leaseExpiresAt: transition.clearLease ? null : batch.leaseExpiresAt,
        recoveryGeneration,
        recoveredAt:
          transition.abandoned && batch.highestGeneration === null
            ? transition.terminalAt
            : null,
      })
      .where(eq(projectionBatches.id, batch.id));
  }

  public async getProjectionBatchDiagnostics(): Promise<ProjectionBatchDiagnostics> {
    const now = this.now();
    const rows = await this.db
      .select({
        status: projectionBatches.status,
        ownerKind: projectionBatches.ownerKind,
        openedAt: projectionBatches.openedAt,
        lastProgressAt: projectionBatches.lastProgressAt,
        leaseExpiresAt: projectionBatches.leaseExpiresAt,
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
      expiredCallbackLeases: active.filter(
        (row) =>
          row.ownerKind === "callback" &&
          row.leaseExpiresAt !== null &&
          row.leaseExpiresAt <= now,
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
        leaseExpiresAt: now + PROJECTION_BATCH_LEASE_MS,
      });
    });
    return scope;
  }

  private async renewCallbackBatch(scope: ProjectionBatchScope): Promise<void> {
    const now = this.now();
    const rows = await this.db
      .update(projectionBatches)
      .set({
        lastProgressAt: now,
        leaseExpiresAt: now + PROJECTION_BATCH_LEASE_MS,
      })
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
        leaseExpiresAt: now + PROJECTION_BATCH_LEASE_MS,
      })
      .where(
        and(
          eq(projectionBatches.id, scope.batchId),
          eq(projectionBatches.ownerToken, scope.ownerToken),
          eq(projectionBatches.status, "open"),
        ),
      );
  }

  public runMutationTransaction<TResult>(
    mutation: (
      transaction: EntityTransaction,
      recordGeneration: (generation: number) => Promise<void>,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    const scope = this.batchScope.getStore();
    return this.runTransaction(async (transaction) => {
      if (scope) await this.assertBatchScope(transaction, scope);
      return mutation(transaction, async (generation) => {
        if (scope) {
          await this.recordBatchGeneration(transaction, scope, generation);
        }
      });
    });
  }

  public async hasActiveBatch(): Promise<boolean> {
    const active = await this.db
      .select({ id: projectionBatches.id })
      .from(projectionBatches)
      .where(inArray(projectionBatches.status, ["preparing", "open"]))
      .limit(1);
    return active.length > 0;
  }

  public async hasActiveBatchInTransaction(
    transaction: EntityTransaction,
  ): Promise<boolean> {
    const active = await transaction
      .select({ id: projectionBatches.id })
      .from(projectionBatches)
      .where(inArray(projectionBatches.status, ["preparing", "open"]))
      .limit(1);
    return active.length > 0;
  }

  public async getAdmissionEpoch(
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

  public async markRecoveredThrough(
    transaction: EntityTransaction,
    cutoffGeneration: number,
    recoveredAt: number,
  ): Promise<void> {
    await transaction
      .update(projectionBatches)
      .set({ recoveredAt })
      .where(
        and(
          eq(projectionBatches.status, "abandoned"),
          isNull(projectionBatches.recoveredAt),
          lte(projectionBatches.recoveryGeneration, cutoffGeneration),
        ),
      );
  }

  private getRecoveryGeneration(
    transaction: EntityTransaction,
    fallback: number,
  ): Promise<number> {
    return this.readRecoveryGeneration(transaction, fallback);
  }

  private runTransaction<TResult>(
    transaction: (database: EntityTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.transactions.run(transaction);
  }

  private runBatchStateWrite<TResult>(
    write: () => Promise<TResult>,
  ): Promise<TResult> {
    return this.transactions.runSqliteWrite(write);
  }
}
