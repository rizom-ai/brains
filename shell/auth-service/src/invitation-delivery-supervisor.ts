import type { Clock as ClockType } from "@brains/utils/effect";
import { PeriodicTaskSupervisor } from "./periodic-task-supervisor";

export const DEFAULT_INVITATION_DELIVERY_RECOVERY_INTERVAL_MS: number = 60_000;

interface InvitationDeliverySupervisorOptions {
  clock?: ClockType.Clock | undefined;
  onError?: ((error: unknown) => void) | undefined;
}

/** Owns interrupted invitation-delivery recovery and drains admitted work. @internal */
export class InvitationDeliverySupervisor extends PeriodicTaskSupervisor {
  constructor(
    intervalMs: number,
    recover: (now: number) => Promise<void>,
    options: InvitationDeliverySupervisorOptions = {},
  ) {
    super(intervalMs, recover, options);
  }
}
