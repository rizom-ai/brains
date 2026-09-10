import {
  BunSchedulerBackend,
  type SchedulerBackend,
  type ScheduledJob,
} from "@brains/scheduler";
import type { Logger } from "@brains/utils/logger";
import type { Daemon, DaemonHealth } from "./daemon-types";

export interface ScheduledMaintenanceOptions {
  intervalMs: number;
  run(): Promise<void>;
  logger: Logger;
  scheduler?: Pick<SchedulerBackend, "scheduleInterval">;
  now?: () => number;
}

/** A bounded maintenance cycle, not an untracked timer. Stop drains callbacks
 * before dependent databases close. Errors and health never retain raw payloads.
 */
export function createScheduledMaintenanceDaemon(
  options: ScheduledMaintenanceOptions,
): Daemon & { healthCheck(): Promise<DaemonHealth> } {
  const scheduler = options.scheduler ?? new BunSchedulerBackend();
  const now = options.now ?? Date.now;
  let lastStartedAt: number | undefined;
  let job: ScheduledJob | undefined;
  let stopping: Promise<void> | undefined;
  let accepting = false;
  let active = false;
  let health: DaemonHealth = { status: "unknown" };
  let successes = 0;
  let failures = 0;

  const cycle = async (): Promise<void> => {
    if (!accepting || active) return;
    active = true;
    lastStartedAt = now();
    try {
      await options.run();
      successes++;
      health = {
        status: "healthy",
        lastCheck: new Date(now()),
        details: { successes, failures },
      };
    } catch {
      // Callback errors may include transcripts, credentials or SQL parameters.
      failures++;
      health = {
        status: "warning",
        message: "Maintenance cycle failed",
        lastCheck: new Date(now()),
        details: { successes, failures },
      };
      options.logger.warn("Maintenance cycle failed", { successes, failures });
    } finally {
      active = false;
    }
  };

  return {
    start: async (): Promise<void> => {
      if (stopping) await stopping;
      if (job) return;
      health = { status: "unknown" };
      lastStartedAt = now();
      job = scheduler.scheduleInterval(options.intervalMs, cycle);
      accepting = true;
    },
    stop: (): Promise<void> => {
      if (stopping) return stopping;
      accepting = false;
      if (!job) return Promise.resolve();
      stopping = job.stop().then(() => {
        job = undefined;
        stopping = undefined;
      });
      return stopping;
    },
    healthCheck: async (): Promise<DaemonHealth> => {
      const current = now();
      if (
        !Number.isSafeInteger(current) ||
        current < 0 ||
        (lastStartedAt !== undefined && !Number.isSafeInteger(lastStartedAt))
      ) {
        return { status: "warning", message: "Maintenance clock unavailable" };
      }
      if (
        accepting &&
        lastStartedAt !== undefined &&
        (current < lastStartedAt ||
          current - lastStartedAt > options.intervalMs * 2)
      ) {
        return {
          status: "warning",
          message: active
            ? "Maintenance cycle is still running"
            : "Maintenance cycle is overdue",
        };
      }
      return {
        ...health,
        ...(health.lastCheck ? { lastCheck: new Date(health.lastCheck) } : {}),
        ...(health.details ? { details: { ...health.details } } : {}),
      };
    },
  };
}
