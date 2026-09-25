import {
  z,
  type IRuntimeStateStore,
  type RuntimeHealthCheck,
} from "@brains/sdk/services";
import type { ContactMaintenanceReport, ContactIntake } from "./intake";
import type { ContactStorageSlots } from "./storage-slots";
import type { ContactHttpHandlers } from "./http";
import type { ContactIntakeConfig } from "./config";
const MAX_MAINTENANCE_AGE_MS = 26 * 60 * 60 * 1000;
export const maintenanceStatusSchema: z.ZodType<
  MaintenanceStatus,
  MaintenanceStatus
> = z.strictObject({
  at: z.number().int().nonnegative(),
  failed: z.boolean(),
});
interface MaintenanceStatus {
  at: number;
  failed: boolean;
}

/** Owned lifecycle state; construction does no IO, including in job workers. */
export class ContactRuntime {
  private readonly stop = new AbortController();
  private maintenance: Promise<void> | undefined;
  private readonly maintenanceStatus: IRuntimeStateStore<MaintenanceStatus>;
  private report: ContactMaintenanceReport | undefined;
  private readyState = false;
  private readonly config: ContactIntakeConfig;
  private readonly intake: ContactIntake;
  private readonly http: ContactHttpHandlers;
  private readonly slots: ContactStorageSlots;
  constructor(
    config: ContactIntakeConfig,
    intake: ContactIntake,
    http: ContactHttpHandlers,
    slots: ContactStorageSlots,
    maintenanceStatus: IRuntimeStateStore<MaintenanceStatus>,
  ) {
    this.maintenanceStatus = maintenanceStatus;
    this.config = config;
    this.intake = intake;
    this.http = http;
    this.slots = slots;
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
    this.readyState = true;
  }
  async handle(
    request: Request,
    transport?: { readonly remoteAddress?: string },
  ): Promise<Response> {
    if (
      !this.readyState ||
      !(await this.maintenanceFresh()) ||
      this.stop.signal.aborted
    )
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
      await this.maintenanceStatus.set("status", {
        at: Date.now(),
        failed: false,
      });
    } catch {
      try {
        const previous = await this.maintenanceStatus.get("status");
        await this.maintenanceStatus.set("status", {
          at: previous?.at ?? 0,
          failed: true,
        });
      } catch {
        // An unreadable status cannot establish freshness; intake stays closed.
      }
      throw new Error("Contact maintenance unavailable");
    }
  }

  private async maintenanceFresh(): Promise<boolean> {
    if (this.stop.signal.aborted) return false;
    try {
      const status = await this.maintenanceStatus.get("status");
      const now = Date.now();
      return (
        status !== null &&
        !status.failed &&
        now >= status.at &&
        now - status.at <= MAX_MAINTENANCE_AGE_MS
      );
    } catch {
      // Storage errors may contain private data; fail closed without exposing it.
      return false;
    }
  }

  async health(): Promise<Omit<RuntimeHealthCheck, "name">> {
    try {
      if (!(await this.maintenanceFresh()))
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
          lastMaintenanceAt: (await this.maintenanceStatus.get("status"))?.at,
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
    await this.maintenance?.catch(() => {
      // The lifecycle/check caller already received the sanitized failure.
    });
  }
}
