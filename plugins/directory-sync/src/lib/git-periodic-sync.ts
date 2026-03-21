import type { Logger } from "@brains/utils";
import type { GitSync } from "./git-sync";
import type { DirectorySync } from "./directory-sync";

/**
 * Periodic pull → import → commit → push cycle.
 * Skips commit+push when nothing changed (no remote files pulled, no local changes).
 * Returns a cleanup function that stops the timer.
 */
export function setupPeriodicGitSync(
  gitSync: GitSync,
  directorySync: DirectorySync,
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
      const { files } = await gitSync.pull();

      if (files.length > 0) {
        logger.info("Periodic sync: pulled changes", {
          filesChanged: files.length,
        });
      }

      await directorySync.sync();

      // Only commit+push if there are actual changes
      const hasLocal =
        typeof gitSync.hasLocalChanges === "function"
          ? await gitSync.hasLocalChanges()
          : true; // fallback: always commit if method missing

      if (files.length > 0 || hasLocal) {
        await gitSync.commit();
        await gitSync.push();
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
