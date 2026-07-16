import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { IGitSync } from "../types";
import type { DirectorySyncRuntime } from "./directory-sync-runtime";

const AUTO_COMMIT_KEY = "git-auto-commit";

/**
 * Subscribe to entity CRUD events and schedule git commit + push.
 *
 * Trailing-only: the entity event fires *before* the auto-export subscriber has
 * written the file, so a leading-edge commit can strand that export. Pending
 * delays are replaceable; once commit/push starts, the runtime drains it.
 */
export function setupGitAutoCommit(
  messaging: ServicePluginContext["messaging"],
  git: IGitSync,
  debounceMs: number,
  logger: Logger,
  runtime: DirectorySyncRuntime,
): void {
  const commitAndPush = async (): Promise<void> => {
    try {
      await git.withLock(async () => {
        await git.commit();
        await git.push();
      });
    } catch (error) {
      logger.error("Git auto-commit failed", { error });
    }
  };

  const events = ["entity:created", "entity:updated", "entity:deleted"];
  for (const event of events) {
    messaging.subscribe(event, async () => {
      runtime.scheduleTrailing(AUTO_COMMIT_KEY, debounceMs, commitAndPush);
      return { success: true };
    });
  }
}
