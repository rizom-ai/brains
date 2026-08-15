import { ENTITY_CHANNELS } from "@brains/contracts";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { IGitSync } from "../types";
import type { DirectorySyncScheduler } from "./directory-sync-runtime";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";
import type { GitReconciliationService } from "./git-reconciliation";
import { getErrorMessage } from "@brains/utils/error";

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
  reconciliation?: Pick<GitReconciliationService, "saveCheckpoint">,
  operationStatus?: DirectorySyncOperationStatusService,
): void {
  const getGitSync =
    typeof gitSync === "function" ? gitSync : (): IGitSync => gitSync;
  const commitAndPush = async (): Promise<void> => {
    const git = getGitSync();
    try {
      const { pushed, checkpoint } = await git.commitAndPush();
      if (!pushed) return;
      // The checkpoint comes from inside the same owned operation, so nothing
      // can have moved HEAD between the push and this advance.
      if (checkpoint) await reconciliation?.saveCheckpoint(checkpoint);

      await operationStatus?.clearIssues(["git"]);
      await operationStatus?.recordTerminal(
        "save",
        "succeeded",
        "Local content committed and pushed",
      );
    } catch (error) {
      logger.error("Git auto-commit failed", { error });
      const message = getErrorMessage(error, "Git auto-commit failed");
      await operationStatus?.recordIssue({ kind: "git", message });
      await operationStatus?.recordTerminal("save", "failed", message);
    }
  };

  const events = [
    ENTITY_CHANNELS.created,
    ENTITY_CHANNELS.updated,
    ENTITY_CHANNELS.deleted,
  ];
  for (const event of events) {
    messaging.subscribe(event, async () => {
      runtime.scheduleTrailing(AUTO_COMMIT_KEY, debounceMs, commitAndPush);
      return { success: true };
    });
  }
}
