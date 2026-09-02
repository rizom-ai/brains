import type {
  DashboardWidgetProviderContext,
  Tool,
  ServicePluginContext,
  WebRouteDefinition,
} from "@brains/plugins";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  PermissionService,
  ServicePlugin,
} from "@brains/plugins";
import { DASHBOARD_CHANNELS } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { DashboardWidgetRegistry } from "./widget-registry";
import type {
  RegisteredWidget,
  WidgetComponent,
  WidgetDigestProvider,
} from "./widget-registry";
import { DashboardAssetRegistry } from "./dashboard-assets";
import { DashboardDataSource } from "./dashboard-datasource";
import { resolveWidgetsForRender } from "./render/resolve-widgets";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "./dashboard-page";
import { deriveConsoleSurfaces } from "@brains/plugins";
import {
  buildConsoleJumpGroups,
  type ConsoleJumpEntityHit,
} from "./console-jump";
import type { DashboardAssetUrls } from "./render/types";
import { getActiveAuthService } from "@brains/auth-service";
import packageJson from "../package.json";

export interface DashboardConfig {
  version: string;
  routePath: string;
  themeCSS?: string | undefined;
}

export interface DashboardConfigInput {
  version?: string | undefined;
  routePath?: string | undefined;
  themeCSS?: string | undefined;
}

const dashboardConfigSchema: z.ZodType<DashboardConfig, DashboardConfigInput> =
  z.object({
    version: z.string().default("1.0.0"),
    routePath: z.string().default("/dashboard"),
    themeCSS: z.string().optional(),
  });

const registerWidgetPayloadSchema = z
  .object({
    id: z.string(),
    pluginId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    group: z.string().min(1),
    priority: z.number().default(50),
    section: z.enum(["primary", "secondary", "sidebar"]).default("primary"),
    rendererName: z.literal(DECLARATIVE_DASHBOARD_WIDGET_RENDERER),
    visibility: z.enum(["public", "trusted", "admin"]).default("public"),
    needsAttention: z.number().int().nonnegative().optional(),
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
    dataProvider: z.custom<
      (context: DashboardWidgetProviderContext) => Promise<unknown>
    >((value) => typeof value === "function", {
      message: "Expected dashboard widget data provider function",
    }),
    digestProvider: z
      .custom<WidgetDigestProvider>((value) => typeof value === "function", {
        message: "Expected dashboard widget digest provider function",
      })
      .optional(),
    renderer: z
      .object({
        component: z.custom<WidgetComponent>(
          (value) => typeof value === "function",
          { message: "Expected dashboard widget component function" },
        ),
        clientStyles: z.string().optional(),
        clientScript: z.string().optional(),
      })
      .optional(),
  })
  .strict();

const unregisterWidgetPayloadSchema = z.object({
  pluginId: z.string(),
  widgetId: z.string().optional(),
});

function createRegisteredWidget(
  payload: z.output<typeof registerWidgetPayloadSchema>,
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
    ...(payload.needsAttention !== undefined && {
      needsAttention: payload.needsAttention,
    }),
    ...(payload.digest ? { digest: payload.digest } : {}),
    dataProvider: payload.dataProvider,
    ...(payload.digestProvider
      ? { digestProvider: payload.digestProvider }
      : {}),
    ...(payload.renderer ? { renderer: payload.renderer } : {}),
  };
}

export class DashboardPlugin extends ServicePlugin<
  DashboardConfig,
  DashboardConfigInput
> {
  private readonly assetRegistry: DashboardAssetRegistry;
  private readonly assetUrls: DashboardAssetUrls;
  private widgetRegistry: DashboardWidgetRegistry | null = null;
  private datasource: DashboardDataSource | null = null;
  private siteUrl: string | undefined;
  private ctx: ServicePluginContext | undefined;

  constructor(config: DashboardConfigInput = {}) {
    super("dashboard", packageJson, config, dashboardConfigSchema);
    this.assetRegistry = new DashboardAssetRegistry(this.config.routePath);
    this.assetUrls = this.assetRegistry.createRenderUrls({
      themeCSS: this.config.themeCSS,
    });
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
      description:
        "Explore this brain's public identity, knowledge, network, and system health.",
      href: this.config.routePath,
      kind: "human",
      priority: 30,
      visibility: "public",
    });

    context.messaging.subscribe(
      DASHBOARD_CHANNELS.registerWidget,
      async (message) => {
        try {
          const payload = registerWidgetPayloadSchema.parse(message.payload);
          const widget = createRegisteredWidget(payload);
          this.widgetRegistry?.register(widget);
          this.logger.debug("Widget registered via messaging", {
            widgetId: payload.id,
            pluginId: payload.pluginId,
            rendererName: payload.rendererName,
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
      DASHBOARD_CHANNELS.unregisterWidget,
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
          const principal =
            await getActiveAuthService()?.resolveSession(request);
          const sessionPermission = principal?.permissionLevel ?? "public";
          // The card is invariant across sessions. Public providers always see
          // an anonymous Public caller, and non-public providers never run.
          const visibleWidgets =
            this.widgetRegistry?.list({ permissionLevel: "public" }) ?? [];
          const [dashboardData, appInfo, publicEntityCounts] =
            await Promise.all([
              this.datasource.getDashboardData({
                permissionLevel: "public",
                widgets: visibleWidgets,
                providerContext: {
                  caller: null,
                  signal: request.signal,
                },
              }),
              ctx.appInfo(),
              ctx.entityService.getEntityCounts("public"),
            ]);
          const character = ctx.identity.get();
          const profile = ctx.identity.getProfile();

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
            entities: publicEntityCounts.reduce(
              (total, entry) => total + entry.count,
              0,
            ),
            entityCounts: publicEntityCounts,
            embeddings: 0,
            daemons: [],
            endpoints: appInfo.endpoints.filter(
              (endpoint) =>
                PermissionService.hasPermission(
                  "public",
                  endpoint.visibility,
                ) && endpoint.requiresActiveSession !== true,
            ),
            interactions: appInfo.interactions.filter(
              (interaction) =>
                PermissionService.hasPermission(
                  "public",
                  interaction.visibility,
                ) && interaction.requiresActiveSession !== true,
            ),
          };

          const title = profile.name || "Public Brain";
          const requestUrl = new URL(request.url);
          const returnTo = `${requestUrl.pathname}${requestUrl.search}`;
          const encodedReturnTo = encodeURIComponent(returnTo);
          const resolved = resolveWidgetsForRender(
            dashboardData.widgets,
            this.widgetRegistry,
          );

          const input: DashboardRenderInput = {
            title,
            baseUrl,
            widgets: resolved.widgets,
            widgetStyles: resolved.widgetStyles,
            widgetScripts: resolved.widgetScripts,
            assetUrls: this.assetUrls,
            dashboardPath: this.config.routePath,
            surfaces: deriveConsoleSurfaces(ctx.webRoutes.getRoutes(), {
              activeId: "dashboard",
              permissionLevel: sessionPermission,
              hasActiveSession: principal !== undefined,
              self: { id: "dashboard", href: this.config.routePath },
            }),
            character,
            profile,
            appInfo: visibleAppInfo,
            ...(this.config.themeCSS !== undefined && {
              themeCSS: this.config.themeCSS,
            }),
            authAccess: {
              ...(principal
                ? {
                    principal: {
                      displayName: principal.displayName,
                      role: principal.role,
                      permissionLevel: principal.permissionLevel,
                    },
                  }
                : {}),
              loginUrl: `/login?return_to=${encodedReturnTo}`,
              logoutUrl: `/logout?return_to=${encodedReturnTo}`,
            },
          };

          return new Response(renderDashboardPageHtml(input), {
            headers: {
              "Cache-Control": "private, no-store",
              "Content-Type": "text/html; charset=utf-8",
            },
          });
        },
      },
      {
        path: "/api/console/jump",
        method: "GET",
        public: true,
        handler: async (request: Request): Promise<Response> => {
          const principal =
            await getActiveAuthService()?.resolveSession(request);
          if (!principal) {
            return Response.json(
              { error: "Authentication required" },
              { status: 401 },
            );
          }
          if (principal.permissionLevel !== "admin") {
            return Response.json(
              { error: "Admin access required" },
              { status: 403 },
            );
          }
          const ctx = this.ctx;
          if (!ctx) {
            return Response.json({ groups: [] });
          }

          const query =
            new URL(request.url).searchParams.get("q")?.trim() ?? "";

          let entities: ConsoleJumpEntityHit[] = [];
          if (query.length >= 2) {
            try {
              const results = await ctx.entityService.search({
                query,
                options: { limit: 6 },
              });
              entities = results.map((result) => {
                const title = Reflect.get(result.entity, "title");
                return {
                  entityType: result.entity.entityType,
                  id: result.entity.id,
                  title: typeof title === "string" ? title : result.entity.id,
                };
              });
            } catch {
              // Search degrades to no entity doors (e.g. index warming).
            }
          }

          const surfaces = deriveConsoleSurfaces(ctx.webRoutes.getRoutes(), {
            activeId: "dashboard",
            permissionLevel: principal.permissionLevel,
            hasActiveSession: true,
          });
          const studioPath = surfaces.find(
            (surface) => surface.id === "studio",
          )?.href;
          return Response.json({
            groups: buildConsoleJumpGroups({
              query,
              dashboardPath: this.config.routePath,
              studioPath,
              entities,
            }),
          });
        },
      },
      ...this.assetRegistry.getRoutes(),
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
  config: DashboardConfigInput = {},
): DashboardPlugin {
  return new DashboardPlugin(config);
}
