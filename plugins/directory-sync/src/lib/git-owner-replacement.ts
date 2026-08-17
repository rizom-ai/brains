import type { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";
import type { DirectorySyncScheduler } from "./directory-sync-runtime";

/**
 * What a role does when the broker underneath it is replaced.
 *
 * A proven-safe replacement leaves web and worker running, so those roles
 * survive with an ambiguous past: whatever the old owner was executing may or
 * may not have landed, and the client deliberately refuses to re-run it from
 * intent — that is how one commit becomes two.
 *
 * Repository state settles it instead. Replaying from the durable checkpoint
 * queues anything that reached the checkout without being enqueued, and queues
 * nothing at all if the lost operation never landed.
 */

export interface OwnerReplacementOptions {
  logger: Logger;
  scheduler: DirectorySyncScheduler;
  replay: () => Promise<unknown>;
}

export function createOwnerReplacementHandler(
  options: OwnerReplacementOptions,
): (brokerId: string) => void {
  let consecutiveFailures = 0;

  const scheduleReplay = (delayMs: number): void => {
    options.scheduler.scheduleTrailing(
      "git-owner-replacement",
      delayMs,
      async (): Promise<void> => {
        try {
          await options.replay();
          consecutiveFailures = 0;
        } catch (error) {
          consecutiveFailures += 1;
          options.logger.error("Reconciling a replaced Git broker failed", {
            error: getErrorMessage(error),
            consecutiveFailures,
          });
          // Keep admission closed while retrying from durable state. The cap
          // avoids both a tight failure loop and an ever-growing outage delay.
          const retryDelayMs = Math.min(
            1_000 * 2 ** (consecutiveFailures - 1),
            30_000,
          );
          scheduleReplay(retryDelayMs);
        }
      },
    );
  };

  return (brokerId: string): void => {
    options.logger.warn(
      "Git broker was replaced; reconciling from the checkout",
      { brokerId },
    );
    // Scheduled rather than awaited: this is reported from inside the
    // operation that reattached, so replaying here would re-enter a client
    // that is still mid-call. The keyed trailing schedule also collapses a
    // burst of reports for one replacement into one replay.
    scheduleReplay(0);
  };
}
