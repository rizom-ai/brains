import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { GitSync } from "./git-sync";

/**
 * Subscribe to entity CRUD events and debounce git commit + push.
 *
 * After any entity change (file already written by auto-sync),
 * wait for the debounce period then commit all changes and push.
 */
export function setupGitAutoCommit(
  messaging: ServicePluginContext["messaging"],
  git: GitSync,
  debounceMs: number,
  logger: Logger,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleCommit = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void (async (): Promise<void> => {
        try {
          await git.commit();
          await git.push();
        } catch (error) {
          logger.error("Git auto-commit failed", { error });
        }
      })();
    }, debounceMs);
  };

  const events = ["entity:created", "entity:updated", "entity:deleted"];
  const unsubscribers: Array<() => void> = [];

  for (const event of events) {
    const unsub = messaging.subscribe(event, async () => {
      scheduleCommit();
      return { success: true };
    });
    unsubscribers.push(unsub);
  }

  return (): void => {
    if (timer) clearTimeout(timer);
    for (const unsub of unsubscribers) unsub();
  };
}
