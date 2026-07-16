import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { IGitSync, IDirectorySync } from "../types";
import type { DirectorySyncRuntime } from "./directory-sync-runtime";

/**
 * Periodic pull → queue imports cycle.
 *
 * Uses queueSyncBatch (non-blocking) instead of sync() (blocking). The runtime
 * owns the fixed-cadence schedule, prevents overlapping cycles, and drains an
 * active cycle during shutdown. Git commit+push remains auto-commit's job.
 */
export function setupPeriodicGitSync(
  gitSync: IGitSync,
  directorySync: IDirectorySync,
  pluginContext: ServicePluginContext,
  intervalMinutes: number,
  logger: Logger,
  runtime: DirectorySyncRuntime,
): void {
  if (intervalMinutes <= 0) return;

  const intervalMs = intervalMinutes * 60 * 1000;
  const cycle = async (signal: AbortSignal): Promise<void> => {
    try {
      const { files, result } = await gitSync.withLock(async () => {
        const pullResult = await gitSync.pull(signal);
        signal.throwIfAborted();
        if (pullResult.files.length === 0) {
          return { files: [], result: null };
        }
        const batchResult = await directorySync.queueSyncBatch(
          pluginContext,
          "periodic-sync",
        );
        return { files: pullResult.files, result: batchResult };
      }, signal);

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
      if (!signal.aborted) {
        logger.error("Periodic git sync failed", { error });
      }
    }
  };

  runtime.schedulePeriodic(intervalMs, cycle);
  logger.info("Started periodic git sync", { intervalMinutes });
}
