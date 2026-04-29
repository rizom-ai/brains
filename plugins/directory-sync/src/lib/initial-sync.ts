import { getErrorMessage } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { DirectorySyncConfig, IDirectorySync, IGitSync } from "../types";
import { copySeedContentIfNeeded } from "./seed-content";

/**
 * Wire up initial-sync orchestration: subscribe to startup messages,
 * optionally copy seed content, import files synchronously, then broadcast
 * sync:initial:completed.
 */
export function setupInitialSync(
  context: ServicePluginContext,
  getDirectorySync: () => IDirectorySync,
  config: DirectorySyncConfig,
  _pluginId: string,
  logger: Logger,
  gitSync?: IGitSync,
): void {
  let initialSyncStarted = false;

  const runInitialSync = async (): Promise<void> => {
    if (initialSyncStarted) return;
    initialSyncStarted = true;

    const directorySync = getDirectorySync();

    if (config.seedContent) {
      const syncPath = config.syncPath ?? context.dataDir;
      await copySeedContentIfNeeded(syncPath, logger, config.seedContentPath);
    }

    try {
      // Pull remote changes before importing
      if (gitSync) {
        logger.debug("Git enabled — pulling before import");
        const pullResult = await gitSync.pull();
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

      await context.messaging.send(
        "sync:initial:completed",
        { success: true },
        { broadcast: true },
      );
    } catch (error) {
      logger.error("Initial sync failed", error);
      await context.messaging.send(
        "sync:initial:completed",
        {
          success: false,
          error: getErrorMessage(error),
        },
        { broadcast: true },
      );
    }
  };

  context.messaging.subscribe("system:plugins:ready", async () => {
    logger.debug("system:plugins:ready received, starting initial sync");
    await runInitialSync();
    return { success: true };
  });
}
