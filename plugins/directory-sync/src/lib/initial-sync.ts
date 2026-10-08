import { getErrorMessage } from "@brains/utils/error";
import {
  JobProgressEventSchema,
  SYSTEM_CHANNELS,
  type PluginsRegisteredAnswer,
  type ServicePluginContext,
} from "@brains/plugins";
import { JOB_CHANNELS } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
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
  context: ServicePluginContext;
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

/**
 * Wire up initial-sync orchestration. On pluginsRegistered the startup
 * content is queued as an import batch for the worker — never imported on the
 * boot path — and the answer says whether that import is pending. Once every
 * followed batch settles, SYSTEM_CHANNELS.initialSyncCompleted is broadcast.
 */
export function setupInitialSync(options: InitialSyncOptions): void {
  const { context, config, logger, gitSync } = options;
  let initialSyncStarted = false;

  const queueInitialSync = async (): Promise<PluginsRegisteredAnswer> => {
    if (initialSyncStarted) return { initialSyncPending: false };
    initialSyncStarted = true;

    if (config.seedContent) {
      const syncPath = config.syncPath ?? context.dataDir;
      await copySeedContentIfNeeded(
        syncPath,
        logger,
        config.seedContentPath,
        gitSync,
      );
      if (config.strictSeedEntityTypes) {
        await validateSeedContentEntityTypes(syncPath, context.entityService);
      }
    }

    let batchIds: string[];
    try {
      batchIds = await queueStartupBatches(options);
    } catch (error) {
      logger.error("Initial sync failed", error);
      await options.recovery?.onGitRecoveryFailed(error);
      await sendCompleted(context, {
        success: false,
        error: getErrorMessage(error),
      });
      // Defaults wait for the completion just sent, which says the sync
      // failed: content it never imported may still be on disk.
      return { initialSyncPending: true };
    }

    if (batchIds.length === 0) {
      await sendCompleted(context, { success: true });
      return { initialSyncPending: false };
    }

    logger.info("Initial sync queued for the worker", { batchIds });
    void followBatches(context, batchIds)
      .then((outcome) => sendCompleted(context, outcome))
      .catch((error: unknown) => {
        logger.error("Unable to report initial sync completion", error);
      });
    return { initialSyncPending: true };
  };

  context.messaging.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
    logger.debug("Plugins registered, queueing initial sync");
    const answer = await queueInitialSync();
    return { success: true, data: answer };
  });
}

/**
 * Queue the startup import and return every batch it has to wait for: a batch
 * an earlier boot left unfinished, and the one queued now. Every file is
 * queued — unchanged ones are skipped on import — so startup still repairs an
 * entity database that lost content, as the inline sync did. Git pulls first.
 */
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
    if (runId) {
      await operationStatus?.failRun(
        runId,
        getErrorMessage(error, "Initial sync failed"),
        gitSync ? "git" : "source",
      );
    }
    throw error;
  }
  await recovery?.onGitRecoverySucceeded();

  if (runId) {
    if (batch) await operationStatus?.attachBatch(runId, batch.batchId);
    else await operationStatus?.completeRun(runId, "No files to import");
  }
  return [unfinished, batch?.batchId].filter(
    (batchId): batchId is string => batchId !== undefined,
  );
}

/**
 * Resolve once every batch has settled, from the batch progress the web
 * process publishes. Each batch's stored status is read after subscribing, so
 * a batch that settled before the subscription is not waited on forever.
 */
function followBatches(
  context: ServicePluginContext,
  batchIds: string[],
): Promise<InitialSyncOutcome> {
  return new Promise((resolve) => {
    const remaining = new Set(batchIds);
    const errors: string[] = [];
    const settle = (batchId: string, batchErrors: string[] | null): void => {
      if (!remaining.delete(batchId)) return;
      if (batchErrors) {
        errors.push(
          ...(batchErrors.length > 0
            ? batchErrors
            : [`Initial sync batch ${batchId} failed`]),
        );
      }
      if (remaining.size > 0) return;
      unsubscribe();
      resolve(
        errors.length === 0
          ? { success: true }
          : { success: false, error: errors.join("; ") },
      );
    };

    const unsubscribe = context.messaging.subscribe(
      JOB_CHANNELS.progress,
      async (message) => {
        const event = JobProgressEventSchema.safeParse(message.payload);
        if (event.success && event.data.type === "batch") {
          if (event.data.status === "completed") settle(event.data.id, null);
          if (event.data.status === "failed") {
            settle(event.data.id, event.data.batchDetails?.errors ?? []);
          }
        }
        return { success: true };
      },
    );

    for (const batchId of batchIds) {
      void context.jobs.getBatchStatus(batchId).then(
        (status) => {
          if (!status) {
            settle(batchId, [`Initial sync batch ${batchId} was not found`]);
          } else if (status.status === "completed") {
            settle(batchId, null);
          } else if (status.status === "failed") {
            settle(batchId, status.errors);
          }
        },
        (error: unknown) => settle(batchId, [getErrorMessage(error)]),
      );
    }
  });
}

async function sendCompleted(
  context: ServicePluginContext,
  outcome: InitialSyncOutcome,
): Promise<void> {
  await context.messaging.send({
    type: SYSTEM_CHANNELS.initialSyncCompleted,
    payload: outcome,
    broadcast: true,
  });
}
