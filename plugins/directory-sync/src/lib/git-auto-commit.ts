import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { LeadingTrailingDebounce } from "@brains/utils";
import type { GitSync } from "./git-sync";

/**
 * Subscribe to entity CRUD events and debounce git commit + push.
 *
 * Uses LeadingTrailingDebounce: first change commits immediately,
 * rapid follow-ups batch into one trailing commit after the delay.
 */
export function setupGitAutoCommit(
  messaging: ServicePluginContext["messaging"],
  git: GitSync,
  debounceMs: number,
  logger: Logger,
): () => void {
  const debounce = new LeadingTrailingDebounce(() => {
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
