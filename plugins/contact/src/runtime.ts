import type { RuntimeHealthCheck, LoggerContract } from "@brains/sdk/services";
import {
  createScheduledMaintenanceDaemon,
  type ScheduledMaintenance,
} from "@brains/scheduler/maintenance";

export interface ContactDependencies {
  readonly maintenance?: typeof createScheduledMaintenanceDaemon | undefined;
}
import type { ContactMaintenanceReport, ContactIntake } from "./intake";
import type { ContactStorageSlots } from "./storage-slots";
import type { ContactHttpHandlers } from "./http";
import type { ContactIntakeConfig } from "./config";
const MAX_MAINTENANCE_AGE_MS = 26 * 60 * 60 * 1000;

/** Owned lifecycle state; construction does no IO, including in job workers. */
export class ContactRuntime {
  private readonly stop = new AbortController();
  private maintenance: Promise<void> | undefined;
  private lastMaintenanceAt: number | undefined;
  private maintenanceFailed = false;
  private report: ContactMaintenanceReport | undefined;
  private readyState = false;
  private readonly config: ContactIntakeConfig;
  private readonly intake: ContactIntake;
  private readonly http: ContactHttpHandlers;
  private readonly slots: ContactStorageSlots;
  private readonly schedule: ScheduledMaintenance;
  constructor(
    config: ContactIntakeConfig,
    intake: ContactIntake,
    http: ContactHttpHandlers,
    slots: ContactStorageSlots,
    logger: LoggerContract,
    dependencies: ContactDependencies = {},
  ) {
    this.config = config;
    this.intake = intake;
    this.http = http;
    this.slots = slots;
    this.schedule = (
      dependencies.maintenance ?? createScheduledMaintenanceDaemon
    )({
      intervalMs: 24 * 60 * 60 * 1000,
      run: async () => this.maintain(this.stop.signal),
      logger,
    });
  }
  async ready(inboxHref: string | undefined): Promise<void> {
    if (
      !inboxHref ||
      !URL.canParse(inboxHref, this.config.http.origin) ||
      new URL(inboxHref, this.config.http.origin).href !== this.config.inboxUrl
    )
      throw new Error("Contact Inbox unavailable");
    await this.maintain(this.stop.signal);
    this.stop.signal.throwIfAborted();
    await this.schedule.start();
    this.stop.signal.throwIfAborted();
    this.readyState = true;
  }
  handle(
    request: Request,
    transport?: { readonly remoteAddress?: string },
  ): Response | Promise<Response> {
    if (!this.readyState || !this.maintenanceFresh())
      return this.http.unavailable(request);
    return this.http.handle(request, transport);
  }
  maintain(signal: AbortSignal): Promise<void> {
    const combined = AbortSignal.any([signal, this.stop.signal]);
    combined.throwIfAborted();
    this.maintenance ??= this.runMaintenance(combined).finally(() => {
      this.maintenance = undefined;
    });
    return this.maintenance;
  }

  private async runMaintenance(signal: AbortSignal): Promise<void> {
    try {
      this.report = await this.intake.maintain(signal);
      signal.throwIfAborted();
      this.lastMaintenanceAt = Date.now();
      this.maintenanceFailed = false;
    } catch {
      this.maintenanceFailed = true;
      throw new Error("Contact maintenance unavailable");
    }
  }

  private maintenanceFresh(): boolean {
    return (
      !this.stop.signal.aborted &&
      !this.maintenanceFailed &&
      this.lastMaintenanceAt !== undefined &&
      Date.now() >= this.lastMaintenanceAt &&
      Date.now() - this.lastMaintenanceAt <= MAX_MAINTENANCE_AGE_MS
    );
  }

  async health(): Promise<Omit<RuntimeHealthCheck, "name">> {
    try {
      if (!this.maintenanceFresh())
        return {
          status: "unhealthy",
          message:
            "Contact retention/recovery is unavailable or overdue; intake is closed.",
        };
      const slots = await this.slots.list();
      const pending = slots.filter(
        ([, slot]) => slot.delivery.status === "pending",
      ).length;
      const failed = slots.filter(
        ([, slot]) => slot.delivery.status === "failed",
      ).length;
      const unconfirmed = slots.filter(
        ([, slot]) => slot.phase === "writing",
      ).length;
      return {
        status:
          pending || failed || unconfirmed || this.report?.enqueueFailures
            ? "degraded"
            : "healthy",
        message:
          "Contact operational counts; notification failure can include an unconfirmed provider outcome.",
        details: {
          records: slots.length,
          pending,
          failed,
          unconfirmed,
          lastMaintenanceAt: this.lastMaintenanceAt,
          ...this.report,
        },
      };
    } catch {
      // State errors can contain stored values; report failure, never those values.
      return {
        status: "unhealthy",
        message: "Contact operational state unavailable.",
      };
    }
  }

  async shutdown(): Promise<void> {
    this.readyState = false;
    this.stop.abort();
    await this.schedule.stop();
    await this.maintenance?.catch(() => {
      // The lifecycle/check caller already received the sanitized failure.
    });
  }
}
