import {
  defineDaemon,
  type InterfaceDaemonDefinition,
} from "@brains/sdk/interfaces";
import { createScheduledMaintenanceDaemon } from "@brains/scheduler/maintenance";
import type { IRuntimeStateNamespace } from "@brains/runtime-state";
import type { Logger } from "@brains/utils/logger";
import { GuestStateMaintenance } from "./guest-maintenance";

/** Use the shared scheduler and its draining stop through the declarative lifecycle. */
export function createGuestMaintenanceDaemon(
  runtimeState: IRuntimeStateNamespace,
  logger: Logger,
): InterfaceDaemonDefinition {
  const maintenance = new GuestStateMaintenance(runtimeState);
  const daemon = createScheduledMaintenanceDaemon({
    intervalMs: 60_000,
    logger,
    run: () => maintenance.run(),
  });
  return defineDaemon({
    id: "guest-maintenance",
    required: false,
    check: async () => {
      const health = await daemon.healthCheck();
      return {
        status: health.status === "unknown" ? "warning" : health.status,
        message:
          health.message ??
          (health.status === "healthy"
            ? "Maintenance healthy"
            : "Waiting for maintenance"),
      };
    },
    run: async ({ signal, health }) => {
      if (signal.aborted) return;
      await daemon.start();
      try {
        health.ready();
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else
            signal.addEventListener("abort", () => resolve(), { once: true });
        });
      } finally {
        await daemon.stop();
      }
    },
  });
}
