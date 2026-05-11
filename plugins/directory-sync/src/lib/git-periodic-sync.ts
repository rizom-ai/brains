import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { IGitSync, IDirectorySync } from "../types";

/**
 * Periodic pull → queue imports → auto-commit cycle.
 *
 * Uses queueSyncBatch (non-blocking) instead of sync() (blocking).
 * Imports run through the job queue so MCP/Discord stay responsive.
 * Git commit+push is handled by auto-commit when entity changes land.
 *
 * Returns a cleanup function that stops the timer.
 */
export function setupPeriodicGitSync(
  gitSync: IGitSync,
  directorySync: IDirectorySync,
  pluginContext: ServicePluginContext,
  intervalMinutes: number,
  logger: Logger,
): () => void {
  if (intervalMinutes <= 0) {
    return (): void => {};
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  let running = false;

  const cycle = async (): Promise<void> => {
    if (running) return;
    running = true;

    try {
      const { files, result } = await gitSync.withLock(async () => {
        const pullResult = await gitSync.pull();
        if (pullResult.files.length === 0) {
          return { files: pullResult.files, result: null };
        }
        const batchResult = await directorySync.queueSyncBatch(
          pluginContext,
          "periodic-sync",
        );
        return { files: pullResult.files, result: batchResult };
      });

      if (files.length > 0) {
        logger.info("Periodic sync: pulled changes", {
          filesChanged: files.length,
        });
      }

      if (result) {
        logger.debug("Periodic sync: queued imports", {
          importOperations: result.importOperationsCount,
          totalFiles: result.totalFiles,
        });
      }
    } catch (error) {
      logger.error("Periodic git sync failed", { error });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void cycle();
  }, intervalMs);

  logger.info("Started periodic git sync", { intervalMinutes });

  return (): void => {
    clearInterval(timer);
  };
}
