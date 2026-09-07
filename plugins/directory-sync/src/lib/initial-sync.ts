import { getErrorMessage } from "@brains/utils/error";
import {
  defineSubscription,
  SYSTEM_CHANNELS,
  type AnySubscriptionDefinition,
} from "@brains/sdk/services";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import type { DirectorySyncHost } from "../host";
import type { DirectorySyncConfig, IDirectorySync, IGitSync } from "../types";
import type { GitReconciliationService } from "./git-reconciliation";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";
import { copySeedContentIfNeeded } from "./seed-content";
import { validateSeedContentEntityTypes } from "./file-discovery";

/**
 * Initial-sync orchestration, declared: once every plugin has registered,
 * optionally copy seed content, import files synchronously, then announce
 * SYSTEM_CHANNELS.initialSyncCompleted.
 */
export function initialSyncSubscription(
  host: Pick<DirectorySyncHost, "dataDir" | "mirror" | "messaging">,
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
): AnySubscriptionDefinition {
  let initialSyncStarted = false;

  const runInitialSync = async (): Promise<void> => {
    if (initialSyncStarted) return;
    initialSyncStarted = true;

    const directorySync = getDirectorySync();

    if (config.seedContent) {
      const syncPath = config.syncPath ?? host.dataDir;
      await copySeedContentIfNeeded(
        syncPath,
        logger,
        config.seedContentPath,
        gitSync,
      );
      if (config.strictSeedEntityTypes) {
        await validateSeedContentEntityTypes(syncPath, host.mirror);
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

      await host.messaging.publish({
        topic: SYSTEM_CHANNELS.initialSyncCompleted,
        data: { success: true },
      });
    } catch (error) {
      logger.error("Initial sync failed", error);
      await recovery?.onGitRecoveryFailed(error);
      await host.messaging.publish({
        topic: SYSTEM_CHANNELS.initialSyncCompleted,
        data: { success: false, error: getErrorMessage(error) },
      });
    }
  };

  return defineSubscription({
    topic: SYSTEM_CHANNELS.pluginsRegistered,
    payload: z.unknown(),
    handle: async () => {
      logger.debug("Plugins registered, starting initial sync");
      await runInitialSync();
      return {};
    },
  });
}
