import type {
  Tool,
  ServicePluginContext,
  WebRouteDefinition,
} from "@brains/plugins";
import {
  PermissionService,
  ServicePlugin,
  UserPermissionLevelSchema,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { getErrorMessage } from "@brains/utils/error";
import {
  BUILT_IN_WIDGET_RENDERERS,
  DashboardWidgetRegistry,
  isBuiltInWidgetRenderer,
} from "./widget-registry";
import type {
  RegisteredWidget,
  WidgetComponent,
  WidgetVisibility,
} from "./widget-registry";
import { DashboardDataSource } from "./dashboard-datasource";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "./dashboard-page";
import { resolveWidgetsForRender } from "./render/resolve-widgets";
import type {
  DashboardActivityEvent,
  DashboardJobProgressItem,
} from "./render/types";
import { getActiveAuthService } from "@brains/auth-service";
import packageJson from "../package.json";

const dashboardConfigSchema = z.object({
  version: z.string().default("1.0.0"),
  routePath: z.string().default("/dashboard"),
  themeCSS: z.string().optional(),
});

type DashboardConfig = z.infer<typeof dashboardConfigSchema>;

const registerWidgetPayloadSchema = z
  .object({
    id: z.string(),
    pluginId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    group: z.string().min(1),
    priority: z.number().default(50),
    section: z.enum(["primary", "secondary", "sidebar"]).default("primary"),
    rendererName: z.string(),
    visibility: UserPermissionLevelSchema.default("public"),
    needsOperator: z.number().int().nonnegative().optional(),
    digest: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
          tone: z.enum(["plain", "good", "warn"]).optional(),
        }),
      )
      .max(4)
      .optional(),
    component: z.custom<WidgetComponent>().optional(),
    clientScript: z.string().optional(),
    dataProvider: z.function().returns(z.promise(z.unknown())),
  })
  .superRefine((payload, refinementContext) => {
    if (!isBuiltInWidgetRenderer(payload.rendererName) && !payload.component) {
      refinementContext.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom dashboard widgets must register a Preact component.",
        path: ["component"],
      });
    }
  });

const unregisterWidgetPayloadSchema = z.object({
  pluginId: z.string(),
  widgetId: z.string().optional(),
});

const entityActivityPayloadSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  conversationId: z.string().optional(),
});

const jobProgressPayloadSchema = z.object({
  id: z.string(),
  type: z.enum(["job", "batch"]),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  message: z.string().optional(),
  progress: z
    .object({
      current: z.number(),
      total: z.number(),
      percentage: z.number(),
    })
    .optional(),
  jobDetails: z
    .object({
      jobType: z.string(),
      priority: z.number(),
      retryCount: z.number(),
    })
    .optional(),
});

const directorySyncStatusResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    syncPath: z.string(),
    isInitialized: z.boolean(),
    watchEnabled: z.boolean(),
  }),
});

function createRegisteredWidget(
  payload: z.infer<typeof registerWidgetPayloadSchema>,
): RegisteredWidget {
  return {
    id: payload.id,
    pluginId: payload.pluginId,
    title: payload.title,
    ...(payload.description ? { description: payload.description } : {}),
    group: payload.group,
    priority: payload.priority,
    section: payload.section,
    rendererName: payload.rendererName,
    visibility: payload.visibility,
    ...(payload.needsOperator !== undefined && {
      needsOperator: payload.needsOperator,
    }),
    ...(payload.digest ? { digest: payload.digest } : {}),
    ...(payload.component ? { component: payload.component } : {}),
    ...(payload.clientScript ? { clientScript: payload.clientScript } : {}),
    dataProvider: payload.dataProvider as () => Promise<unknown>,
  };
}

export class DashboardPlugin extends ServicePlugin<DashboardConfig> {
  private widgetRegistry: DashboardWidgetRegistry | null = null;
  private datasource: DashboardDataSource | null = null;
  private siteUrl: string | undefined;
  private ctx: ServicePluginContext | undefined;
  private activityLog: DashboardActivityEvent[] = [];
  private jobProgress: DashboardJobProgressItem[] = [];

  constructor(config?: Partial<DashboardConfig>) {
    super("dashboard", packageJson, config ?? {}, dashboardConfigSchema);
  }

  private recordActivity(
    action: DashboardActivityEvent["action"],
    payload: unknown,
  ): void {
    const parsed = entityActivityPayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    this.activityLog = [
      {
        action,
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        timestamp: new Date().toISOString(),
        ...(parsed.data.conversationId
          ? { conversationId: parsed.data.conversationId }
          : {}),
      },
      ...this.activityLog,
    ].slice(0, 12);
  }

  private recordJobProgress(payload: unknown): void {
    const parsed = jobProgressPayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    const progressLabel = parsed.data.progress
      ? `${parsed.data.progress.current}/${parsed.data.progress.total}`
      : undefined;
    const nextItem: DashboardJobProgressItem = {
      id: parsed.data.id,
      kind: parsed.data.type,
      status: parsed.data.status,
      updatedAt: new Date().toISOString(),
      ...(parsed.data.message ? { message: parsed.data.message } : {}),
      ...(parsed.data.jobDetails?.jobType
        ? { jobType: parsed.data.jobDetails.jobType }
        : {}),
      ...(progressLabel ? { progressLabel } : {}),
    };

    this.jobProgress = [
      nextItem,
      ...this.jobProgress.filter(
        (item) => item.id !== nextItem.id || item.kind !== nextItem.kind,
      ),
    ].slice(0, 8);
  }

  private getIndexReady(): boolean | undefined {
    if (!this.ctx) return undefined;

    const entityService = this.ctx
      .entityService as typeof this.ctx.entityService & {
      isIndexReady?: () => boolean;
    };

    if (typeof entityService.isIndexReady !== "function") {
      return undefined;
    }

    try {
      return entityService.isIndexReady();
    } catch (error) {
      this.logger.debug("Semantic index status unavailable", {
        error: getErrorMessage(error),
      });
      return undefined;
    }
  }

  private async getDirectorySyncStatus(): Promise<
    DashboardRenderInput["directorySyncStatus"]
  > {
    if (!this.ctx) return undefined;

    try {
      const response = await this.ctx.messaging.send({
        type: "sync:status:request",
        payload: {},
      });
      const parsed = directorySyncStatusResponseSchema.safeParse(response);
      return parsed.success ? parsed.data.data : undefined;
    } catch (error) {
      this.logger.debug("Directory sync status unavailable", {
        error: getErrorMessage(error),
      });
      return undefined;
    }
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.siteUrl = context.siteUrl;
    this.ctx = context;

    this.widgetRegistry = new DashboardWidgetRegistry(this.logger);
    this.datasource = new DashboardDataSource(this.widgetRegistry, this.logger);
    context.entities.registerDataSource(this.datasource);
    context.endpoints.register({
      label: "Dashboard",
      url: this.config.routePath,
      priority: 30,
      visibility: "public",
    });
    context.interactions.register({
      id: "dashboard",
      label: "Dashboard",
      description: "Inspect runtime status, endpoints, and dashboard widgets.",
      href: this.config.routePath,
      kind: "admin",
      priority: 30,
      visibility: "public",
    });

    context.messaging.subscribe("entity:created", async (message) => {
      this.recordActivity("created", message.payload);
      return { success: true };
    });
    context.messaging.subscribe("entity:updated", async (message) => {
      this.recordActivity("updated", message.payload);
      return { success: true };
    });
    context.messaging.subscribe("entity:deleted", async (message) => {
      this.recordActivity("deleted", message.payload);
      return { success: true };
    });
    context.messaging.subscribe("job-progress", async (message) => {
      this.recordJobProgress(message.payload);
      return { success: true };
    });

    context.messaging.subscribe(
      "dashboard:register-widget",
      async (message) => {
        try {
          const payload = registerWidgetPayloadSchema.parse(message.payload);
          const widget = createRegisteredWidget(payload);
          this.widgetRegistry?.register(widget);
          this.logger.debug("Widget registered via messaging", {
            widgetId: payload.id,
            pluginId: payload.pluginId,
            rendererName: payload.rendererName,
            builtIn: BUILT_IN_WIDGET_RENDERERS.includes(
              payload.rendererName as (typeof BUILT_IN_WIDGET_RENDERERS)[number],
            ),
          });
          return { success: true };
        } catch (error) {
          this.logger.error("Failed to register widget", {
            error: getErrorMessage(error),
            payload: message.payload,
          });
          return { success: false, error: "Widget registration failed" };
        }
      },
    );

    context.messaging.subscribe(
      "dashboard:unregister-widget",
      async (message) => {
        try {
          const payload = unregisterWidgetPayloadSchema.parse(message.payload);
          this.widgetRegistry?.unregister(payload.pluginId, payload.widgetId);
          this.logger.debug("Widget unregistered via messaging", {
            pluginId: payload.pluginId,
            widgetId: payload.widgetId,
          });
          return { success: true };
        } catch (error) {
          this.logger.error("Failed to unregister widget", {
            error: getErrorMessage(error),
            payload: message.payload,
          });
          return { success: false, error: "Widget unregistration failed" };
        }
      },
    );

    this.logger.info("Dashboard plugin registered");
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return [
      {
        path: this.config.routePath,
        method: "GET",
        public: true,
        handler: async (request: Request): Promise<Response> => {
          if (!this.datasource || !this.ctx) {
            return new Response("Dashboard unavailable", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }

          const ctx = this.ctx;
          const operatorSession =
            await getActiveAuthService()?.getOperatorSession(request);
          const isOperator = Boolean(operatorSession);
          const permissionLevel: WidgetVisibility = isOperator
            ? "anchor"
            : "public";
          const anchorWidgets =
            this.widgetRegistry?.list({ permissionLevel: "anchor" }) ?? [];
          const visibleWidgets = anchorWidgets.filter((widget) =>
            PermissionService.hasPermission(permissionLevel, widget.visibility),
          );
          const hiddenWidgetCount =
            anchorWidgets.length - visibleWidgets.length;
          const [dashboardData, appInfo, directorySyncStatus] =
            await Promise.all([
              this.datasource.getDashboardData({
                permissionLevel,
                widgets: visibleWidgets,
              }),
              ctx.appInfo(),
              this.getDirectorySyncStatus(),
            ]);
          const character = ctx.identity.get();
          const profile = ctx.identity.getProfile();
          const indexReady = this.getIndexReady();

          const baseUrl =
            this.siteUrl ??
            ((): string | undefined => {
              try {
                return new URL(request.url).origin;
              } catch {
                return undefined;
              }
            })();

          const visibleAppInfo = {
            ...appInfo,
            endpoints: appInfo.endpoints.filter((endpoint) =>
              PermissionService.hasPermission(
                permissionLevel,
                endpoint.visibility,
              ),
            ),
            interactions: appInfo.interactions.filter((interaction) =>
              PermissionService.hasPermission(
                permissionLevel,
                interaction.visibility,
              ),
            ),
          };

          const title = profile.name || appInfo.model || "Brain Dashboard";
          const requestUrl = new URL(request.url);
          const returnTo = `${requestUrl.pathname}${requestUrl.search}`;
          const encodedReturnTo = encodeURIComponent(returnTo);
          const resolvedWidgets = resolveWidgetsForRender(
            dashboardData.widgets,
            this.widgetRegistry,
          );

          const input: DashboardRenderInput = {
            title,
            baseUrl,
            widgets: resolvedWidgets.widgets,
            widgetScripts: resolvedWidgets.widgetScripts,
            dashboardPath: this.config.routePath,
            character,
            profile,
            appInfo: visibleAppInfo,
            activityLog: this.activityLog,
            jobProgress: this.jobProgress,
            ...(indexReady !== undefined && { indexReady }),
            ...(directorySyncStatus !== undefined && { directorySyncStatus }),
            ...(this.config.themeCSS !== undefined && {
              themeCSS: this.config.themeCSS,
            }),
            operatorAccess: {
              isOperator,
              hiddenWidgetCount,
              loginUrl: `/login?return_to=${encodedReturnTo}`,
              logoutUrl: `/logout?return_to=${encodedReturnTo}`,
            },
          };

          return new Response(renderDashboardPageHtml(input), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        },
      },
    ];
  }

  protected override async getTools(): Promise<Tool[]> {
    return [];
  }

  getWidgetRegistry(): DashboardWidgetRegistry | null {
    return this.widgetRegistry;
  }
}

export function dashboardPlugin(
  config?: Partial<DashboardConfig>,
): DashboardPlugin {
  return new DashboardPlugin(config);
}
