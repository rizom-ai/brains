import { getErrorMessage } from "@brains/utils/error";
import { SYSTEM_CHANNELS, type ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { DirectorySyncConfig, IDirectorySync, IGitSync } from "../types";
import type { GitReconciliationService } from "./git-reconciliation";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";
import { copySeedContentIfNeeded } from "./seed-content";
import { validateSeedContentEntityTypes } from "./file-discovery";

/**
 * Wire up initial-sync orchestration: subscribe to startup messages,
 * optionally copy seed content, import files synchronously, then broadcast
 * SYSTEM_CHANNELS.initialSyncCompleted.
 */
export function setupInitialSync(
  context: ServicePluginContext,
  getDirectorySync: () => IDirectorySync,
  config: DirectorySyncConfig,
  logger: Logger,
  gitSync?: IGitSync,
  reconciliation?: Pick<
    GitReconciliationService,
    "captureCurrent" | "saveCheckpoint"
  >,
  recovery?: {
    onGitProgress(): void;
    onGitRecoverySucceeded(): Promise<void>;
    onGitRecoveryFailed(error: unknown): Promise<void>;
  },
  operationStatus?: Pick<
    DirectorySyncOperationStatusService,
    "addImportResult"
  >,
): void {
  let initialSyncStarted = false;

  const runInitialSync = async (): Promise<void> => {
    if (initialSyncStarted) return;
    initialSyncStarted = true;

    const directorySync = getDirectorySync();

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

    try {
      // Pull remote changes before importing
      if (gitSync) {
        logger.debug("Git enabled — pulling before import");
        recovery?.onGitProgress();
        const pullResult = await gitSync.pull(
          undefined,
          recovery?.onGitProgress,
        );
        await directorySync.recordPendingPullDeletes(
          pullResult.deletedFiles ?? [],
        );
        if (pullResult.files.length > 0) {
          logger.info("Pulled changes from remote", {
            filesChanged: pullResult.files.length,
          });
        }
      }

      logger.debug("Starting initial sync");
      const result = await directorySync.sync();
      logger.debug("Initial sync completed", {
        imported: result.import.imported,
        failed: result.import.failed,
        duration: result.duration,
      });
      await operationStatus?.addImportResult(result.import);
      if (gitSync && reconciliation) {
        const gitResult = await gitSync.commitAndPush();
        if (gitResult.pushed && !gitResult.checkpoint) {
          throw new Error(
            "Initial directory sync push did not return a confirmed checkpoint",
          );
        }
        if (gitResult.checkpoint) {
          await reconciliation.saveCheckpoint(gitResult.checkpoint);
        } else {
          await reconciliation.captureCurrent(gitSync);
        }
      }
      await recovery?.onGitRecoverySucceeded();

      await context.messaging.send({
        type: SYSTEM_CHANNELS.initialSyncCompleted,
        payload: { success: true },
        ...{ broadcast: true },
      });
    } catch (error) {
      logger.error("Initial sync failed", error);
      await recovery?.onGitRecoveryFailed(error);
      await context.messaging.send({
        type: SYSTEM_CHANNELS.initialSyncCompleted,
        payload: {
          success: false,
          error: getErrorMessage(error),
        },
        ...{ broadcast: true },
      });
    }
  };

  context.messaging.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
    logger.debug("Plugins registered, starting initial sync");
    await runInitialSync();
    return { success: true };
  });
}
