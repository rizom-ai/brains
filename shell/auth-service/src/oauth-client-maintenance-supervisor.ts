import type { Clock as ClockType } from "@brains/utils/effect";
import { PeriodicTaskSupervisor } from "./periodic-task-supervisor";

interface OAuthClientMaintenanceSupervisorOptions {
  clock?: ClockType.Clock | undefined;
  onError?: ((error: unknown) => void) | undefined;
}

/** Owns scheduled OAuth-client pruning and drains admitted maintenance. @internal */
export class OAuthClientMaintenanceSupervisor extends PeriodicTaskSupervisor {
  constructor(
    intervalMs: number,
    maintenance: (now: number) => Promise<void>,
    options: OAuthClientMaintenanceSupervisorOptions = {},
  ) {
    super(intervalMs, maintenance, options);
  }
}
