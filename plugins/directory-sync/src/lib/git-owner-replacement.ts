import type { Logger } from "@brains/utils/logger";
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
  return (brokerId: string): void => {
    options.logger.warn(
      "Git broker was replaced; reconciling from the checkout",
      { brokerId },
    );
    // Scheduled rather than awaited: this is reported from inside the
    // operation that reattached, so replaying here would re-enter a client
    // that is still mid-call.
    options.scheduler.scheduleTrailing(
      "git-owner-replacement",
      0,
      async (): Promise<void> => {
        try {
          await options.replay();
        } catch (error) {
          // A failed reconciliation must not take down a role that is
          // otherwise healthy; the next trigger tries again.
          options.logger.error("Reconciling a replaced Git broker failed", {
            error,
          });
        }
      },
    );
  };
}
