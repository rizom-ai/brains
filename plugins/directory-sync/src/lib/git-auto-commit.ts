import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { IGitSync } from "../types";
import type { DirectorySyncScheduler } from "./directory-sync-runtime";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";

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
  gitSync: IGitSync | (() => IGitSync),
  debounceMs: number,
  logger: Logger,
  runtime: DirectorySyncScheduler,
  operationStatus?: DirectorySyncOperationStatusService,
): void {
  const getGitSync =
    typeof gitSync === "function" ? gitSync : (): IGitSync => gitSync;
  const commitAndPush = async (): Promise<void> => {
    const git = getGitSync();
    try {
      await git.withLock(async () => {
        await git.commit();
        await git.push();
      });
      await operationStatus?.clearIssues(["git"]);
      await operationStatus?.recordTerminal(
        "save",
        "succeeded",
        "Local content committed and pushed",
      );
    } catch (error) {
      logger.error("Git auto-commit failed", { error });
      const message =
        error instanceof Error ? error.message : "Git auto-commit failed";
      await operationStatus?.recordIssue({ kind: "git", message });
      await operationStatus?.recordTerminal("save", "failed", message);
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
