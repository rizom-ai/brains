import { getErrorMessage } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { DirectorySync } from "./directory-sync";
import type { DirectorySyncConfig } from "../types";
import { copySeedContentIfNeeded } from "./seed-content";
import type { GitSync } from "./git-sync";

/**
 * Poll batch status until all jobs complete (or timeout).
 * Yields the event loop between checks.
 */
async function waitForBatch(
  context: ServicePluginContext,
  batchId: string,
  logger: Logger,
  timeoutMs = 60000,
): Promise<void> {
  const checkInterval = 100;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await context.jobs.getBatchStatus(batchId);

    if (
      status &&
      (status.status === "completed" || status.status === "failed")
    ) {
      logger.debug("Batch completed", {
        batchId,
        status: status.status,
        completed: status.completedOperations,
        failed: status.failedOperations,
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  logger.warn(`Timeout waiting for batch ${batchId} after ${timeoutMs}ms`);
}

/**
 * Wire up initial-sync orchestration: subscribe to startup messages,
 * optionally copy seed content, queue imports via job queue
 * (non-blocking), wait for completion, then broadcast
 * sync:initial:completed.
 */
export function setupInitialSync(
  context: ServicePluginContext,
  getDirectorySync: () => DirectorySync,
  config: DirectorySyncConfig,
  _pluginId: string,
  logger: Logger,
  gitSync?: GitSync,
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

      // Queue import jobs (non-blocking — yields event loop between batches)
      logger.debug("Starting initial sync");
      const batchResult = await directorySync.queueSyncBatch(
        context,
        "initial-sync",
        undefined,
        { includeCleanup: true },
      );

      if (!batchResult) {
        logger.debug("Initial sync: no files to import");
        await context.messaging.send(
          "sync:initial:completed",
          { success: true },
          { broadcast: true },
        );
        return;
      }

      logger.debug("Initial sync: queued imports", {
        importOperations: batchResult.importOperationsCount,
        totalFiles: batchResult.totalFiles,
      });

      // Wait for import jobs to finish
      await waitForBatch(context, batchResult.batchId, logger);

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
