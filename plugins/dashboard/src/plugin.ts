import type { WebRouteDefinition } from "@brains/plugins";
import {
  PermissionService,
  dashboardWidgetRegisterContract,
  dashboardWidgetUnregisterContract,
} from "@brains/plugins";
import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  serviceRuntime,
  withWebRoutes,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
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
import {
  buildConsoleJumpGroups,
  jumpEntityHit,
  type ConsoleJumpEntityHit,
} from "./console-jump";
import type { DashboardAssetUrls } from "./render/types";

export const dashboardConfigSchema: z.ZodObject<{
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

/** What Dashboard holds once set up, which its routes are built from. */
export interface DashboardState {
  readonly runtime: ServiceRuntime;
  readonly widgetRegistry: DashboardWidgetRegistry;
  readonly datasource: DashboardDataSource;
  readonly assetRegistry: DashboardAssetRegistry;
  readonly assetUrls: DashboardAssetUrls;
}

/** A test's view of the package's state once set up. */
export interface DashboardDeps {
  readonly onSetup?: ((state: DashboardState) => void) | undefined;
}

/**
 * The public Dashboard: the brain's identity, knowledge, network and
 * system health on one page at `routePath`, built from the widgets other
 * plugins register, and the admin console jump palette.
 */
export function createDashboardPackage(
  deps: DashboardDeps = {},
): ServicePackageDefinition<typeof dashboardConfigSchema> {
  const service = defineServicePlugin({
    id: "dashboard",
    config: dashboardConfigSchema,
    setup: (context): DashboardState => {
      const runtime = serviceRuntime(context);
      const { config } = context;
      const { logger } = runtime;
      const assetRegistry = new DashboardAssetRegistry(config.routePath);
      const assetUrls = assetRegistry.createRenderUrls({
        themeCSS: config.themeCSS,
      });
      const widgetRegistry = new DashboardWidgetRegistry(logger);
      const datasource = new DashboardDataSource(widgetRegistry, logger);
      runtime.endpoint({
        label: "Dashboard",
        url: config.routePath,
        priority: 30,
        visibility: "public",
      });
      runtime.interaction({
        id: "dashboard",
        label: "Dashboard",
        description:
          "Explore this brain's public identity, knowledge, network, and system health.",
        href: config.routePath,
        kind: "human",
        priority: 30,
        visibility: "public",
      });

      runtime.answer(
        dashboardWidgetRegisterContract,
        async ({ request: payload }) => {
          try {
            widgetRegistry.register(createRegisteredWidget(payload));
          } catch (error) {
            logger.error("Failed to register widget", {
              error: getErrorMessage(error),
              widgetId: payload.id,
              pluginId: payload.pluginId,
            });
            throw new Error("Widget registration failed", { cause: error });
          }
          logger.debug("Widget registered via messaging", {
            widgetId: payload.id,
            pluginId: payload.pluginId,
            rendererName: payload.rendererName,
          });
        },
      );

      runtime.answer(
        dashboardWidgetUnregisterContract,
        async ({ request: payload }) => {
          widgetRegistry.unregister(payload.pluginId, payload.widgetId);
          logger.debug("Widget unregistered via messaging", {
            pluginId: payload.pluginId,
            widgetId: payload.widgetId,
          });
        },
      );

      logger.info("Dashboard plugin registered");
      const state = {
        runtime,
        widgetRegistry,
        datasource,
        assetRegistry,
        assetUrls,
      };
      deps.onSetup?.(state);
      return state;
    },
  });
  return withWebRoutes<typeof dashboardConfigSchema, DashboardState>(
    service,
    ({ config, state }) => dashboardRoutes(config, state),
  );
}

/** The dashboard page, the console jump and the page's assets. */
function dashboardRoutes(
  config: DashboardConfig,
  {
    runtime,
    widgetRegistry,
    datasource,
    assetRegistry,
    assetUrls,
  }: DashboardState,
): WebRouteDefinition[] {
  return [
    {
      path: config.routePath,
      method: "GET",
      public: true,
      role: "dashboard",
      handler: async (request: Request): Promise<Response> => {
        const principal = await runtime.auth()?.resolveSession(request);
        const requestUrl = new URL(request.url);
        const studioPath = runtime.routeByRole("studio")?.fullPath;
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
        const askHref = runtime.routeByRole("ask")?.fullPath;
        // The card is invariant across sessions. Public providers always see
        // an anonymous Public caller, and non-public providers never run.
        const visibleWidgets = widgetRegistry.list({
          permissionLevel: "public",
        });
        const [dashboardData, appInfo, publicEntityCounts] = await Promise.all([
          datasource.getDashboardData({
            permissionLevel: "public",
            widgets: visibleWidgets,
            providerContext: {
              caller: null,
              signal: request.signal,
            },
          }),
          runtime.identity.getAppInfo(),
          runtime.entityReads.getEntityCounts("public"),
        ]);
        const character = runtime.identity.get();
        const profile = runtime.identity.getProfile();

        const baseUrl =
          runtime.siteUrl ??
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
              PermissionService.hasPermission("public", endpoint.visibility) &&
              endpoint.requiresActiveSession !== true,
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
          widgetRegistry,
        );

        const input: DashboardRenderInput = {
          title,
          baseUrl,
          widgets: resolved.widgets,
          widgetStyles: resolved.widgetStyles,
          widgetScripts: resolved.widgetScripts,
          assetUrls,
          dashboardPath: config.routePath,
          askEnabled: config.ask && askHref !== undefined,
          ...(askHref ? { askHref } : {}),
          character,
          profile,
          appInfo: visibleAppInfo,
          ...(config.themeCSS !== undefined && {
            themeCSS: config.themeCSS,
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
        const principal = await runtime.auth()?.resolveSession(request);
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
        const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

        let entities: ConsoleJumpEntityHit[] = [];
        if (query.length >= 2) {
          // Only the search is tolerated: it degrades to no entity doors
          // while the index warms. Shaping the rows below is ours, and a
          // fault there is not a warming index.
          let results;
          try {
            results = await runtime.entityReads.search({
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
                runtime.entityShapes.displayTitle(result.entity),
              ),
            );
          }
        }

        const surfaces = runtime.consoleSurfaces({
          activeId: "dashboard",
          permissionLevel: principal.permissionLevel,
          hasActiveSession: true,
        });
        const studioPath = surfaces.find(
          (surface) => surface.id === "studio",
        )?.href;
        const offered = await runtime.messaging.gather(
          consoleJumpDestinationsContract,
          { permissionLevel: principal.permissionLevel },
        );
        const destinations =
          offered.status === "answered" ? offered.answers.flat() : [];
        return Response.json({
          groups: buildConsoleJumpGroups({
            query,
            dashboardPath: config.routePath,
            studioPath,
            entities,
            destinations,
          }),
        });
      },
    },
    ...assetRegistry.getRoutes(),
  ];
}
