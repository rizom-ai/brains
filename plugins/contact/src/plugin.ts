import {
  ServicePlugin,
  type IRuntimeStateStore,
  type ServicePluginContext,
  type WebRouteDefinition,
  type RuntimeHealthCheck,
} from "@brains/plugins";
import {
  NOTIFICATIONS_SEND,
  type SendNotificationInput,
  type SendNotificationResult,
} from "@brains/contracts";
import {
  SITE_METADATA_GET_CHANNEL,
  SITE_METADATA_UPDATED_CHANNEL,
} from "@brains/site-composition";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { ContactInboxSource } from "./inbox-source";
import { ContactAdmission } from "./admission";
import { ContactIntake, type ContactMaintenanceReport } from "./intake";
import { ContactHttpHandlers } from "./http";
import { ContactDelivery } from "./delivery";
import { ContactStorageSlots } from "./storage-slots";
import { contactRequestSchema } from "./entity/schema";
import { contactPluginConfigSchema, type ContactPluginConfig } from "./config";

const notificationJobSchema = z.strictObject({
  id: z.string().regex(/^contact-[a-f0-9]{64}$/),
});
const MAX_MAINTENANCE_AGE_MS = 26 * 60 * 60 * 1000;
/** Shared across processes: a separate worker runs the daily maintenance the
 * web process's intake depends on. */
const maintenanceStatusSchema = z.strictObject({
  at: z.number().int().nonnegative(),
  failed: z.boolean(),
});
type MaintenanceStatus = z.output<typeof maintenanceStatusSchema>;
/** Only the theme is read from the site's metadata. */
const siteThemeSchema = z.looseObject({
  themeMode: z.enum(["light", "dark"]).optional(),
});

/** Default-off public intake. Runtime policy is explicit; readiness requires
 * recovery and the actual Studio Inbox destination, not a successful email send.
 */
export class ContactPlugin extends ServicePlugin<ContactPluginConfig, unknown> {
  readonly dependencies: string[];
  private http: ContactHttpHandlers | undefined;
  private intake: ContactIntake | undefined;
  private slots: ContactStorageSlots | undefined;
  private readonly stop = new AbortController();
  private maintenance: Promise<void> | undefined;
  private maintenanceStatus: IRuntimeStateStore<MaintenanceStatus> | undefined;
  private report: ContactMaintenanceReport | undefined;
  private readyState = false;
  private siteTheme: "light" | "dark" | undefined;
  private readonly unregister: Array<() => void> = [];

  constructor(config: ContactPluginConfig = {}) {
    super("contact", packageJson, config, contactPluginConfigSchema);
    this.dependencies = this.config.intake
      ? ["contact-request", "notifications", "studio", "unified-inbox"]
      : ["contact-request"];
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    if (!context.executionOnly)
      context.inbox.registerSource(new ContactInboxSource(context));
    const config = this.config.intake;
    if (!config) return;
    const delivery = new ContactDelivery({
      entities: context.entityService,
      state: context.runtimeState,
      storage: config.storage,
      policy: config.delivery,
      send: async (idempotencyKey): Promise<boolean> => {
        const result = await context.messaging.send<
          SendNotificationInput,
          SendNotificationResult
        >({
          type: NOTIFICATIONS_SEND,
          payload: {
            title: "New contact request",
            body: `A contact request is saved in your authenticated Inbox.\n\n${config.inboxUrl}`,
            sensitivity: "secret",
            idempotencyKey,
          },
        });
        return (
          !("noop" in result) &&
          result.success &&
          result.data?.status === "sent"
        );
      },
    });
    context.jobs.registerHandler("notify", {
      executionTimeoutMs: 60_000,
      validateAndParse: (input) => {
        const parsed = notificationJobSchema.safeParse(input);
        return parsed.success ? parsed.data : null;
      },
      process: async (input, _jobId, _progress, signal) => {
        const data = notificationJobSchema.safeParse(input);
        if (!data.success) throw new Error("Invalid contact notification job");
        return delivery.deliver(data.data.id, signal);
      },
    });
    // Both processes build intake: the web process serves it, while a separate
    // worker runs its maintenance and the site builds that look for the form.
    this.maintenanceStatus = context.runtimeState.scoped({
      namespace: "contact.maintenance",
      schema: maintenanceStatusSchema,
    });
    this.slots = new ContactStorageSlots(
      context.runtimeState,
      config.storage,
      Date.now,
    );
    const admission = new ContactAdmission(
      context.runtimeState,
      config.admission,
    );
    this.intake = new ContactIntake({
      admission,
      entities: context.entityService,
      state: context.runtimeState,
      policy: config.storage,
      enqueueNotification: async (id): Promise<void> => {
        await context.jobs.enqueue({
          type: "notify",
          data: { id },
          toolContext: null,
          options: {
            source: "contact",
            metadata: { operationType: "data_processing", silent: true },
            deduplication: "skip",
            deduplicationKey: `contact-notification:${id}`,
            maxRetries: config.delivery.maxAttempts,
          },
        });
      },
    });
    this.http = new ContactHttpHandlers(admission, this.intake, config.http, {
      themeCSS: context.themeCSS,
      // Preview reachability serves the deployment's own preview host too.
      previewOrigin: config.preview ? context.previewUrl : undefined,
      owner: (): string => context.identity.getProfile().name,
      defaultTheme: (): "light" | "dark" | undefined => this.siteTheme,
    });
    if (!context.executionOnly)
      context.messaging.subscribe<unknown, { success: boolean }>(
        SITE_METADATA_UPDATED_CHANNEL,
        async (message) => {
          this.siteTheme = siteThemeSchema.safeParse(message.payload).data
            ?.themeMode;
          return { success: true };
        },
      );
    context.endpoints.register({
      label: "Contact",
      url: `${config.http.origin}/contact`,
      priority: 50,
      visibility: "public",
    });
    this.unregister.push(
      context.recurringChecks.register({
        id: "maintenance",
        cadence: "daily",
        deliverAlerts: false,
        includeInInbox: false,
        run: async ({ signal }) => {
          await this.maintain(signal);
          return {};
        },
      }),
    );
    if (!context.executionOnly)
      this.unregister.push(
        context.operationalHealth.register("intake", () =>
          this.health(context.entityService),
        ),
      );
  }

  override getWebRoutes(): WebRouteDefinition[] {
    const http = this.http;
    if (!http) return [];
    return http.routes(this.config.intake?.preview).map((route) => ({
      ...route,
      handler: async (request, transport): Promise<Response> => {
        if (!this.readyState || !(await this.maintenanceFresh()))
          return http.unavailable(request);
        return route.handler(request, transport);
      },
    }));
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    // A separate worker never serves the form, so it is never ready to.
    if (context.executionOnly || !this.intake) return;
    const config = this.config.intake;
    const destinationMounted =
      config &&
      context.plugins.has("unified-inbox") &&
      context.webRoutes
        .getRoutes()
        .some(
          (route) =>
            route.pluginId === "studio" &&
            (route.definition.method ?? "GET") === "GET" &&
            route.definition.match === "prefix" &&
            route.fullPath.endsWith("/workspaces") &&
            config.inboxUrl ===
              `${config.http.origin}${route.fullPath}/unified-inbox%3Ainbox`,
        );
    if (!destinationMounted) throw new Error("Contact Inbox unavailable");
    await this.readSiteTheme(context);
    await this.maintain(this.stop.signal);
    this.stop.signal.throwIfAborted();
    this.readyState = true;
  }

  /** The form opens in the site's own theme when a link names none. */
  private async readSiteTheme(context: ServicePluginContext): Promise<void> {
    try {
      const response = await context.messaging.send({
        type: SITE_METADATA_GET_CHANNEL,
        payload: undefined,
      });
      if ("success" in response && response.success)
        this.siteTheme = siteThemeSchema.safeParse(response.data).data
          ?.themeMode;
    } catch {
      // No site describes a theme; the page keeps its own default.
    }
  }

  private maintain(signal: AbortSignal): Promise<void> {
    const combined = AbortSignal.any([signal, this.stop.signal]);
    combined.throwIfAborted();
    this.maintenance ??= this.runMaintenance(combined).finally(() => {
      this.maintenance = undefined;
    });
    return this.maintenance;
  }

  private async runMaintenance(signal: AbortSignal): Promise<void> {
    try {
      if (!this.intake || !this.maintenanceStatus)
        throw new Error("Contact intake unavailable");
      this.report = await this.intake.maintain(signal);
      signal.throwIfAborted();
      await this.maintenanceStatus.set("status", {
        at: Date.now(),
        failed: false,
      });
    } catch {
      await this.recordMaintenanceFailure();
      throw new Error("Contact maintenance unavailable");
    }
  }

  private async recordMaintenanceFailure(): Promise<void> {
    try {
      const previous = await this.maintenanceStatus?.get("status");
      await this.maintenanceStatus?.set("status", {
        at: previous?.at ?? 0,
        failed: true,
      });
    } catch {
      // The status store itself failed; an unreadable status already keeps
      // intake closed, and the caller reports the maintenance failure.
    }
  }

  private async maintenanceFresh(): Promise<boolean> {
    if (this.stop.signal.aborted || !this.maintenanceStatus) return false;
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
      // An unreadable status cannot show that retention ran; keep intake closed.
      return false;
    }
  }

  private async health(
    entities: ServicePluginContext["entityService"],
  ): Promise<Omit<RuntimeHealthCheck, "name">> {
    try {
      if (!this.slots || !(await this.maintenanceFresh()))
        return {
          status: "unhealthy",
          message:
            "Contact retention/recovery is unavailable or overdue; intake is closed.",
        };
      const slots = await this.slots.list();
      const pending = slots.filter(
        ([, slot]) => slot.delivery.status === "pending",
      ).length;
      const failed = slots
        .filter(([, slot]) => slot.delivery.status === "failed")
        .map(([id]) => id);
      const failedUnhandled = await this.unhandled(entities, failed);
      const unconfirmed = slots.filter(
        ([, slot]) => slot.phase === "writing",
      ).length;
      return {
        status:
          pending ||
          failedUnhandled ||
          unconfirmed ||
          this.report?.enqueueFailures
            ? "degraded"
            : "healthy",
        message:
          "Contact operational counts. A failed alert counts until its request is marked Done in the Inbox; failure can include an unconfirmed provider outcome.",
        details: {
          records: slots.length,
          pending,
          failed: failed.length,
          failedUnhandled,
          unconfirmed,
          lastMaintenanceAt: (await this.maintenanceStatus?.get("status"))?.at,
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

  /** Failed alerts whose request still waits in the Inbox. Marking it Done
   * acknowledges the failure: the owner has seen what the alert was for. */
  private async unhandled(
    entities: ServicePluginContext["entityService"],
    failed: string[],
  ): Promise<number> {
    const waiting = await Promise.all(
      failed.map(async (id) => {
        const request = await entities.getEntity(
          { entityType: "contact-request", id, visibilityScope: "restricted" },
          contactRequestSchema,
        );
        return request?.metadata.status === "new";
      }),
    );
    return waiting.filter(Boolean).length;
  }

  protected override async onShutdown(): Promise<void> {
    this.readyState = false;
    this.stop.abort();
    for (const unregister of this.unregister.splice(0)) unregister();
    await this.maintenance?.catch(() => {
      // The initiating lifecycle/check caller received the sanitized failure;
      // shutdown still drains the owned work after aborting it.
    });
  }
}
