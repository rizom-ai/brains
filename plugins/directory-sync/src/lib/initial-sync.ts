import { getErrorMessage } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { DirectorySync } from "./directory-sync";
import type { DirectorySyncConfig } from "../types";
import { copySeedContentIfNeeded } from "./seed-content";

/**
 * Wait for a set of job IDs to complete (or time out after 30 s).
 */
async function waitForJobs(
  context: ServicePluginContext,
  jobIds: string[],
  operationType: string,
  logger: Logger,
): Promise<void> {
  const maxWaitTime = 30000;
  const checkInterval = 100;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const statuses = await Promise.all(
      jobIds.map((id) => context.jobs.getStatus(id)),
    );

    let allComplete = true;
    let failedCount = 0;
    let completedCount = 0;

    for (const status of statuses) {
      if (!status) continue;

      if (status.status === "pending" || status.status === "processing") {
        allComplete = false;
      } else if (status.status === "failed") {
        failedCount++;
      } else {
        completedCount++;
      }
    }

    if (allComplete) {
      logger.debug(`All ${operationType} jobs completed`, {
        total: jobIds.length,
        completed: completedCount,
        failed: failedCount,
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  logger.warn(
    `Timeout waiting for ${operationType} jobs to complete after ${maxWaitTime}ms`,
  );
}

/**
 * Queue a full sync batch via DirectorySync.
 */
async function queueSyncJob(
  context: ServicePluginContext,
  directorySync: DirectorySync,
  pluginId: string,
  operation: "initial" | "scheduled" | "manual",
  logger: Logger,
): Promise<string> {
  const result = await directorySync.queueSyncBatch(
    context,
    `directory-sync-${operation}`,
    { pluginId },
  );

  if (!result) {
    logger.info("No sync operations needed", { operation });
    return `empty-sync-${Date.now()}`;
  }

  return result.batchId;
}

/**
 * Wire up initial-sync orchestration: subscribe to startup messages,
 * optionally copy seed content, run the first sync, and wait for
 * embedding jobs before broadcasting sync:initial:completed.
 */
export function setupInitialSync(
  context: ServicePluginContext,
  getDirectorySync: () => DirectorySync,
  config: DirectorySyncConfig,
  pluginId: string,
  logger: Logger,
): void {
  let initialSyncStarted = false;
  let gitSyncEnabled = false;

  const runInitialSync = async (): Promise<void> => {
    if (initialSyncStarted) return;
    initialSyncStarted = true;

    const directorySync = getDirectorySync();

    if (config.seedContent) {
      const syncPath = config.syncPath ?? context.dataDir;
      await copySeedContentIfNeeded(syncPath, logger);
    }

    await queueSyncJob(context, directorySync, pluginId, "initial", logger);

    try {
      logger.debug("Starting initial bidirectional sync");
      const syncResult = await directorySync.sync();
      logger.debug("Initial sync completed", {
        imported: syncResult.import.imported,
        jobCount: syncResult.import.jobIds.length,
      });

      if (syncResult.import.jobIds.length > 0) {
        logger.debug(
          "Waiting for embedding generation to complete for imported entities",
        );
        await waitForJobs(
          context,
          syncResult.import.jobIds,
          "embedding",
          logger,
        );
        logger.debug("All embedding jobs completed");
      }

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

  context.messaging.subscribe("git:sync:registered", async () => {
    logger.debug(
      "git:sync:registered received, will wait for git:pull:completed",
    );
    gitSyncEnabled = true;
    return { success: true };
  });

  context.messaging.subscribe("git:pull:completed", async () => {
    logger.debug("git:pull:completed received, starting initial sync");
    await runInitialSync();
    return { success: true };
  });

  context.messaging.subscribe("system:plugins:ready", async () => {
    if (gitSyncEnabled) {
      logger.debug(
        "system:plugins:ready received, but git-sync is enabled - waiting for git:pull:completed",
      );
    } else {
      logger.debug(
        "system:plugins:ready received, no git-sync - starting initial sync immediately",
      );
      await runInitialSync();
    }
    return { success: true };
  });
}
