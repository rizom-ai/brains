import {
  SerialQueue,
  type BaseEntity,
  type ContentVisibility,
} from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { GitReconciliationCheckpoint, IGitSync } from "../types";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";
import type { DirectorySyncRuntime } from "./directory-sync-runtime";
import {
  drainDurableEntityExports,
  type DurableEntityExportIntent,
} from "./durable-entity-export";

const DEFAULT_RECONCILIATION_INTERVAL_MS = 5_000;
const MAX_DRAIN_PASSES = 100;

export interface DurableEntityExportEntityService {
  listPendingEntityExports(): Promise<DurableEntityExportIntent[]>;
  hasPendingEntityExports(): Promise<boolean>;
  acknowledgeEntityExports(request: {
    intents: readonly DurableEntityExportIntent[];
  }): Promise<number>;
  getEntity(request: {
    entityType: string;
    id: string;
    visibilityScope?: ContentVisibility;
  }): Promise<BaseEntity | null>;
}

export interface DurableEntityExportDirectory {
  suppressWatchPaths(paths: string[]): void;
  isPendingDelete(entityType: string, entityId: string): boolean;
  fileOps: {
    getEntityConvergencePaths(entity: BaseEntity): string[];
    writeEntity(entity: BaseEntity): Promise<void>;
    getEntityDeletePaths(entityType: string, entityId: string): string[];
    deleteEntityFiles(entityType: string, entityId: string): Promise<void>;
  };
}

export interface DurableEntityExportDispatcherOptions {
  runtime: DirectorySyncRuntime;
  directorySync: DurableEntityExportDirectory;
  entityService: DurableEntityExportEntityService;
  gitSync?: IGitSync | undefined;
  saveCheckpoint?:
    ((checkpoint: GitReconciliationCheckpoint) => Promise<void>) | undefined;
  operationStatus?: DirectorySyncOperationStatusService | undefined;
  logger: Logger;
  debounceMs: number;
  reconciliationIntervalMs?: number | undefined;
}

/**
 * Web/Git-owner consumer for the transactional entity-export outbox.
 *
 * Events call wake() for latency. The reconciliation schedule is the durable
 * admission path for intents committed by other processes or without an event.
 */
export class DurableEntityExportDispatcher {
  private readonly queue = new SerialQueue();
  private readonly runtime: DirectorySyncRuntime;
  private readonly directorySync: DurableEntityExportDirectory;
  private readonly entityService: DurableEntityExportDispatcherOptions["entityService"];
  private readonly gitSync: IGitSync | undefined;
  private readonly saveCheckpoint:
    ((checkpoint: GitReconciliationCheckpoint) => Promise<void>) | undefined;
  private readonly operationStatus:
    DirectorySyncOperationStatusService | undefined;
  private readonly logger: Logger;
  private readonly debounceMs: number;
  private readonly reconciliationIntervalMs: number;
  private started = false;

  constructor(options: DurableEntityExportDispatcherOptions) {
    this.runtime = options.runtime;
    this.directorySync = options.directorySync;
    this.entityService = options.entityService;
    this.gitSync = options.gitSync;
    this.saveCheckpoint = options.saveCheckpoint;
    this.operationStatus = options.operationStatus;
    this.logger = options.logger;
    this.debounceMs = options.debounceMs;
    this.reconciliationIntervalMs =
      options.reconciliationIntervalMs ?? DEFAULT_RECONCILIATION_INTERVAL_MS;
  }

  /** Drain startup backlog, then own steady-state cross-process admission. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.runtime.schedulePeriodic(this.reconciliationIntervalMs, (signal) =>
      this.reconcilePending(signal),
    );
    await this.reconcilePending();
  }

  /** Best-effort latency wakeup; correctness does not depend on this call. */
  wake(): void {
    this.runtime.scheduleTrailing(
      "durable-entity-export",
      this.debounceMs,
      () => this.attemptDrain(),
    );
  }

  /** Cleanup admission is synchronous with settlement and fails closed. */
  async settleBeforeCleanup(): Promise<void> {
    try {
      await this.drain();
    } catch (error) {
      await this.recordFailure(error);
      this.wake();
      throw error;
    }
  }

  private async reconcilePending(signal?: AbortSignal): Promise<void> {
    try {
      signal?.throwIfAborted();
      if (!(await this.entityService.hasPendingEntityExports())) return;
      signal?.throwIfAborted();
      await this.drain();
    } catch (error) {
      if (signal?.aborted) return;
      await this.recordFailure(error);
      this.wake();
    }
  }

  private async attemptDrain(): Promise<void> {
    try {
      await this.drain();
    } catch (error) {
      await this.recordFailure(error);
      this.wake();
    }
  }

  private async drain(): Promise<void> {
    await this.queue.run(() => this.drainPass(MAX_DRAIN_PASSES));
  }

  private async drainPass(remainingPasses: number): Promise<void> {
    const baseDeps = {
      listPendingEntityExports: (): ReturnType<
        DurableEntityExportDispatcherOptions["entityService"]["listPendingEntityExports"]
      > => this.entityService.listPendingEntityExports(),
      getEntity: this.entityService.getEntity.bind(this.entityService),
      writeEntity: async (entity: BaseEntity): Promise<void> => {
        this.directorySync.suppressWatchPaths(
          this.directorySync.fileOps.getEntityConvergencePaths(entity),
        );
        await this.directorySync.fileOps.writeEntity(entity);
      },
      deleteEntityFile: async (
        entityType: string,
        entityId: string,
      ): Promise<void> => {
        this.directorySync.suppressWatchPaths(
          this.directorySync.fileOps.getEntityDeletePaths(entityType, entityId),
        );
        await this.directorySync.fileOps.deleteEntityFiles(
          entityType,
          entityId,
        );
      },
      isPendingRemoteDelete: (entityType: string, entityId: string): boolean =>
        this.directorySync.isPendingDelete(entityType, entityId),
      acknowledgeEntityExports:
        this.entityService.acknowledgeEntityExports.bind(this.entityService),
    };
    const gitSync = this.gitSync;
    const saveCheckpoint = this.saveCheckpoint;
    const result = gitSync
      ? await drainDurableEntityExports({
          ...baseDeps,
          commitAndPush: () => gitSync.commitAndPush(),
          saveCheckpoint: async (checkpoint): Promise<void> => {
            if (!saveCheckpoint) {
              throw new Error(
                "Git export checkpoint persistence is unavailable; durable intents remain pending",
              );
            }
            await saveCheckpoint(checkpoint);
          },
        })
      : await drainDurableEntityExports(baseDeps);

    if (!(await this.entityService.hasPendingEntityExports())) {
      await this.operationStatus?.clearIssues(["export", "git"]);
      return;
    }
    if (result.processed === 0) {
      throw new Error("Durable entity exports could not make progress");
    }
    if (remainingPasses <= 1) {
      throw new Error("Durable entity exports did not settle");
    }
    await this.drainPass(remainingPasses - 1);
  }

  private async recordFailure(error: unknown): Promise<void> {
    const message = getErrorMessage(error, "Entity export failed");
    this.logger.error("Durable entity export failed", { error });
    try {
      await this.operationStatus?.recordIssue({
        kind: "export",
        message,
      });
    } catch (statusError) {
      this.logger.error("Failed to record durable entity export issue", {
        error: statusError,
      });
    }
  }
}
