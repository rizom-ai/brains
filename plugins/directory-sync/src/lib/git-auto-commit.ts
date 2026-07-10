import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { TrailingDebounce } from "@brains/utils/debounce";
import type { IGitSync } from "../types";

/**
 * Subscribe to entity CRUD events and debounce git commit + push.
 *
 * Trailing-only: the entity event fires *before* the auto-export
 * subscriber has written the file, so a leading-edge commit would run
 * against a tree the change hasn't reached yet — committing nothing and
 * stranding the export until the next periodic sync. Committing after
 * the window settles also batches rapid changes into one commit.
 */
export function setupGitAutoCommit(
  messaging: ServicePluginContext["messaging"],
  git: IGitSync,
  debounceMs: number,
  logger: Logger,
): () => void {
  const debounce = new TrailingDebounce(() => {
    void git.withLock(async () => {
      try {
        await git.commit();
        await git.push();
      } catch (error) {
        logger.error("Git auto-commit failed", { error });
      }
    });
  }, debounceMs);

  const events = ["entity:created", "entity:updated", "entity:deleted"];
  const unsubscribers: Array<() => void> = [];

  for (const event of events) {
    const unsub = messaging.subscribe(event, async () => {
      debounce.trigger();
      return { success: true };
    });
    unsubscribers.push(unsub);
  }

  return (): void => {
    debounce.dispose();
    for (const unsub of unsubscribers) unsub();
  };
}
