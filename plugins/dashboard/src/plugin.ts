import type {
  Tool,
  ServicePluginContext,
  WebRouteDefinition,
} from "@brains/plugins";
import {
  PermissionService,
  ServicePlugin,
  dashboardWidgetRegisterContract,
  dashboardWidgetUnregisterContract,
} from "@brains/plugins";
import { consoleJumpDestinationsContract } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { DashboardWidgetRegistry } from "./widget-registry";
import type { RegisteredWidget } from "./widget-registry";
import { DashboardAssetRegistry } from "./dashboard-assets";
import { DashboardDataSource } from "./dashboard-datasource";
import { resolveWidgetsForRender } from "./render/resolve-widgets";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "./dashboard-page";
import { deriveConsoleSurfaces, entityDisplayTitle } from "@brains/plugins";
import {
  buildConsoleJumpGroups,
  jumpEntityHit,
  type ConsoleJumpEntityHit,
} from "./console-jump";
import type { DashboardAssetUrls } from "./render/types";
import packageJson from "../package.json";

const dashboardConfigSchema: z.ZodObject<{
  version: z.ZodDefault<z.ZodString>;
  routePath: z.ZodDefault<z.ZodString>;
  ask: z.ZodDefault<z.ZodBoolean>;
  themeCSS: z.ZodOptional<z.ZodString>;
}> = z.object({
  version: z.string().default("1.0.0"),
  routePath: z.string().default("/dashboard"),
  ask: z.boolean().default(false),
  themeCSS: z.string().optional(),
});

export type DashboardConfig = z.output<typeof dashboardConfigSchema>;
export type DashboardConfigInput = z.input<typeof dashboardConfigSchema>;

function createRegisteredWidget(
  payload: z.output<typeof dashboardWidgetRegisterContract.schema>,
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

    context.messaging.answer(
      dashboardWidgetRegisterContract,
      async (payload) => {
        try {
          this.widgetRegistry?.register(createRegisteredWidget(payload));
        } catch (error) {
          this.logger.error("Failed to register widget", {
            error: getErrorMessage(error),
            widgetId: payload.id,
            pluginId: payload.pluginId,
          });
          throw new Error("Widget registration failed", { cause: error });
        }
        this.logger.debug("Widget registered via messaging", {
          widgetId: payload.id,
          pluginId: payload.pluginId,
          rendererName: payload.rendererName,
        });
      },
    );

    context.messaging.answer(
      dashboardWidgetUnregisterContract,
      async (payload) => {
        this.widgetRegistry?.unregister(payload.pluginId, payload.widgetId);
        this.logger.debug("Widget unregistered via messaging", {
          pluginId: payload.pluginId,
          widgetId: payload.widgetId,
        });
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
        role: "dashboard",
        handler: async (request: Request): Promise<Response> => {
          if (!this.datasource || !this.ctx) {
            return new Response("Dashboard unavailable", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }

          const ctx = this.ctx;
          const principal = await ctx.auth.get()?.resolveSession(request);
          const requestUrl = new URL(request.url);
          const studioPath = ctx.webRoutes.findByRole("studio")?.fullPath;
          if (
            principal &&
            studioPath &&
            requestUrl.searchParams.get("view") !== "public"
          ) {
            return new Response(null, {
              status: 302,
              headers: {
                Location: studioPath,
                "Cache-Control": "no-store",
              },
            });
          }
          const askHref = ctx.webRoutes.findByRole("ask")?.fullPath;
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
          const returnTo =
            studioPath ?? `${requestUrl.pathname}${requestUrl.search}`;
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
            askEnabled: this.config.ask && askHref !== undefined,
            ...(askHref ? { askHref } : {}),
            character,
            profile,
            appInfo: visibleAppInfo,
            ...(this.config.themeCSS !== undefined && {
              themeCSS: this.config.themeCSS,
            }),
            authAccess: {
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
          const principal = await this.ctx?.auth.get()?.resolveSession(request);
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
            // Only the search is tolerated: it degrades to no entity doors
            // while the index warms. Shaping the rows below is ours, and a
            // fault there is not a warming index.
            let results;
            try {
              results = await ctx.entityService.search({
                query,
                options: { limit: 6 },
              });
            } catch {
              results = undefined;
            }

            if (results) {
              entities = results.map((result) =>
                jumpEntityHit(
                  result.entity,
                  entityDisplayTitle(ctx.entities, result.entity),
                ),
              );
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
          const offered = await ctx.messaging.gather(
            consoleJumpDestinationsContract,
            { permissionLevel: principal.permissionLevel },
          );
          const destinations =
            offered.status === "answered" ? offered.answers.flat() : [];
          return Response.json({
            groups: buildConsoleJumpGroups({
              query,
              dashboardPath: this.config.routePath,
              studioPath,
              entities,
              destinations,
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
