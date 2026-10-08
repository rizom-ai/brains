import { getErrorMessage } from "@brains/utils/error";
import {
  defineSubscription,
  SYSTEM_CHANNELS,
  type AnySubscriptionDefinition,
} from "@brains/sdk/services";
import { JOB_CHANNELS } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { Logger } from "@brains/utils/logger";
import type { DirectorySyncHost } from "../host";
import type {
  BatchResult,
  DirectorySyncConfig,
  IDirectorySync,
  IGitSync,
} from "../types";
import type { GitReconciliationService } from "./git-reconciliation";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";
import { copySeedContentIfNeeded } from "./seed-content";
import { validateSeedContentEntityTypes } from "./file-discovery";

export interface InitialSyncRecovery {
  onGitProgress(): void;
  onGitRecoverySucceeded(): Promise<void>;
  onGitRecoveryFailed(error: unknown): Promise<void>;
}

export interface InitialSyncOptions {
  context: DirectorySyncHost;
  getDirectorySync: () => IDirectorySync;
  config: DirectorySyncConfig;
  logger: Logger;
  gitSync?: IGitSync | undefined;
  reconciliation?: Pick<GitReconciliationService, "pullAndQueue"> | undefined;
  recovery?: InitialSyncRecovery | undefined;
  operationStatus?:
    | Pick<
        DirectorySyncOperationStatusService,
        "startRun" | "attachBatch" | "completeRun" | "failRun" | "getSnapshot"
      >
    | undefined;
}

type InitialSyncOutcome = { success: true } | { success: false; error: string };
const INITIAL_SYNC_SOURCE = "initial-sync";

/** Queue startup work, then follow only this installed package's durable batches.
 * Both listeners are declarations: the host installs and removes them together.
 * Progress messages are wakeups, not evidence that a batch actually completed.
 */
export function initialSyncSubscriptions(
  options: InitialSyncOptions,
): readonly AnySubscriptionDefinition[] {
  const { context, config, logger, gitSync } = options;
  let started = false;
  let pending = false;
  const remaining = new Set<string>();
  const errors: string[] = [];

  const sendCompleted = async (outcome: InitialSyncOutcome): Promise<void> => {
    await context.messaging.publish({
      topic: SYSTEM_CHANNELS.initialSyncCompleted,
      data: outcome,
    });
  };
  const checkBatch = async (id: string): Promise<void> => {
    if (!remaining.has(id)) return;
    // A transient read failure is not a terminal import result. Keep waiting;
    // a later progress notification can retry the authoritative scoped read.
    const status = await context.jobs.batchStatus(id);
    if (status && status.status !== "completed" && status.status !== "failed")
      return;
    if (!remaining.delete(id)) return;
    if (!status) errors.push(`Initial sync batch ${id} was not found`);
    else if (status.status === "failed") {
      errors.push(
        ...(status.errors.length
          ? status.errors.map((error) => error.message)
          : [`Initial sync batch ${id} failed`]),
      );
    }
    if (remaining.size) return;
    pending = false;
    await sendCompleted(
      errors.length
        ? { success: false, error: errors.join("; ") }
        : { success: true },
    );
  };

  return [
    defineSubscription({
      topic: SYSTEM_CHANNELS.pluginsRegistered,
      payload: z.looseObject({}),
      handle: async () => {
        if (started)
          return { initialSyncPending: pending || errors.length > 0 };
        started = true;
        pending = true;
        let batchIds: string[];
        try {
          if (config.seedContent) {
            const syncPath = config.syncPath ?? context.dataDir;
            await copySeedContentIfNeeded(
              syncPath,
              logger,
              config.seedContentPath,
              gitSync,
            );
            if (config.strictSeedEntityTypes)
              await validateSeedContentEntityTypes(syncPath, context.mirror);
          }
          batchIds = await queueStartupBatches(options);
        } catch (error) {
          logger.error("Initial sync failed", error);
          await options.recovery?.onGitRecoveryFailed(error);
          await sendCompleted({
            success: false,
            error: getErrorMessage(error),
          });
          return { initialSyncPending: true };
        }
        if (!batchIds.length) {
          pending = false;
          await sendCompleted({ success: true });
        } else {
          for (const id of batchIds) remaining.add(id);
          // Closes the race with completion while queueing, including an old
          // batch whose terminal notification preceded this process entirely.
          for (const id of remaining) {
            try {
              await checkBatch(id);
            } catch (error) {
              logger.error("Unable to read initial sync batch", error);
            }
          }
        }
        // Even an already-terminal failed batch requires the shell to consume
        // its failed outcome; false would admit defaults over unimported files.
        return { initialSyncPending: pending || errors.length > 0 };
      },
    }),
    defineSubscription({
      topic: JOB_CHANNELS.progress,
      payload: z.looseObject({ type: z.string(), id: z.string() }),
      handle: async ({ payload }) => {
        if (payload.type === "batch") await checkBatch(payload.id);
        return { success: true };
      },
    }),
  ];
}

/** An unfinished earlier batch and a full repair sweep, never inline import. */
async function queueStartupBatches(
  options: InitialSyncOptions,
): Promise<string[]> {
  const {
    context,
    getDirectorySync,
    gitSync,
    reconciliation,
    recovery,
    operationStatus,
  } = options;
  const directorySync = getDirectorySync();
  const unfinished = (await operationStatus?.getSnapshot())?.activeRun?.batchId;
  const runId = await operationStatus?.startRun(
    "startup",
    gitSync ? "pulling" : "scanning",
  );
  let batch: BatchResult | null;
  try {
    if (gitSync && reconciliation) {
      recovery?.onGitProgress();
      const reconciled = await reconciliation.pullAndQueue({
        gitSync,
        directorySync,
        context,
        source: INITIAL_SYNC_SOURCE,
        full: true,
        ...(recovery ? { onGitProgress: recovery.onGitProgress } : {}),
      });
      batch = reconciled.batch;
    } else {
      batch = await directorySync.queueSyncBatch(context, INITIAL_SYNC_SOURCE);
    }
  } catch (error) {
    if (runId)
      await operationStatus?.failRun(
        runId,
        getErrorMessage(error, "Initial sync failed"),
        gitSync ? "git" : "source",
      );
    throw error;
  }
  await recovery?.onGitRecoverySucceeded();
  if (runId) {
    if (batch) await operationStatus?.attachBatch(runId, batch.batchId);
    else await operationStatus?.completeRun(runId, "No files to import");
  }
  return [unfinished, batch?.batchId].filter(
    (id): id is string => id !== undefined,
  );
}
