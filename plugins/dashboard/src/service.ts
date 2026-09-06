import {
  defineDataSource,
  defineRoute,
  defineServicePlugin,
  defineSubscription,
  PermissionService,
  verbatim,
  type AnyInterfaceRouteDefinition,
  type AppInfo,
  type ConsoleSurface,
  type IAuthRegistry,
  type LoggerContract,
  type ServicePackageDefinition,
  type SurfacePermissionLevel,
} from "@brains/sdk/services";
import type { z } from "@brains/sdk/services";
import { DASHBOARD_CHANNELS } from "@brains/contracts";
import { dashboardConfigSchema } from "./config";
import { DashboardAssetRegistry } from "./dashboard-assets";
import { DashboardDataSource } from "./dashboard-datasource";
import {
  buildConsoleJumpGroups,
  type ConsoleJumpEntityHit,
} from "./console-jump";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "./dashboard-page";
import { resolveWidgetsForRender } from "./render/resolve-widgets";
import type { DashboardAssetUrls } from "./render/types";
import {
  createRegisteredWidget,
  registerWidgetPayloadSchema,
  unregisterWidgetPayloadSchema,
} from "./widget-payloads";
import { DashboardWidgetRegistry } from "./widget-registry";

/**
 * What the console reads of the brain while a request is in flight.
 *
 * A route handler is given the request and nothing else, so the reads it
 * makes are held here from registration: who the brain is, what it reports
 * about itself, how much of it is public, and what a caller may search.
 */
export interface DashboardReads {
  identity: {
    get(): DashboardRenderInput["character"];
    getProfile(): DashboardRenderInput["profile"];
    getAppInfo(): Promise<AppInfo>;
  };
  entities: {
    getEntityCounts(
      visibility?: "public",
    ): Promise<Array<{ entityType: string; count: number }>>;
    search(request: {
      query: string;
      options?: { limit?: number };
    }): Promise<Array<{ entity: { entityType: string; id: string } }>>;
  };
  auth: IAuthRegistry;
  surfaces: (options: {
    permissionLevel?: SurfacePermissionLevel | undefined;
    hasActiveSession?: boolean | undefined;
    selfHref?: string | undefined;
  }) => readonly ConsoleSurface[];
  siteUrl: string | undefined;
  logger: LoggerContract;
}

/** What the dashboard holds while it runs. */
export interface DashboardState {
  readonly widgets: DashboardWidgetRegistry;
  readonly dashboard: DashboardDataSource;
  readonly assets: DashboardAssetRegistry;
  readonly assetUrls: DashboardAssetUrls;
  readonly reads: DashboardReads;
}

/**
 * The brain's public front page, and the console strip that reaches the rest.
 *
 * Widgets are not declared here: every package that declares
 * `dashboardWidgets` announces one, and this service is what those
 * announcements reach. It renders what they returned, at the permission
 * level of whoever asked, and offers the doors the runtime says are mounted.
 */
export interface DashboardDeps {
  /** The widget registry to hold, when a test needs the same one. */
  widgets?: DashboardWidgetRegistry;
}

export function dashboardService(
  deps: DashboardDeps = {},
): ServicePackageDefinition<typeof dashboardConfigSchema> {
  // Routes are declared from config alone, so the page handler reaches its
  // state through this rather than through an argument it is not given.
  let held: DashboardState | undefined;

  return defineServicePlugin({
    id: "dashboard",
    config: dashboardConfigSchema,

    setup: ({
      config,
      identity,
      entities,
      auth,
      surfaces,
      siteUrl,
      logger,
    }): DashboardState => {
      const widgets = deps.widgets ?? new DashboardWidgetRegistry(logger);
      const assets = new DashboardAssetRegistry(config.routePath);
      const state: DashboardState = {
        widgets,
        dashboard: new DashboardDataSource(widgets, logger),
        assets,
        assetUrls: assets.createRenderUrls({
          ...(config.themeCSS !== undefined && { themeCSS: config.themeCSS }),
        }),
        reads: {
          identity,
          entities,
          auth,
          surfaces,
          siteUrl,
          logger,
        },
      };
      logger.info("Dashboard registered", { routePath: config.routePath });
      held = state;
      return state;
    },

    // A widget arrives from whichever package declared it; the payload schema
    // is the boundary, and a malformed one is refused rather than rendered.
    subscriptions: ({ state }) => [
      defineSubscription({
        topic: DASHBOARD_CHANNELS.registerWidget,
        payload: registerWidgetPayloadSchema,
        handle: ({ payload }) => {
          state.widgets.register(createRegisteredWidget(payload));
          state.reads.logger.debug("Widget registered", {
            widgetId: payload.id,
            pluginId: payload.pluginId,
          });
          return { success: true };
        },
      }),
      defineSubscription({
        topic: DASHBOARD_CHANNELS.unregisterWidget,
        payload: unregisterWidgetPayloadSchema,
        handle: ({ payload }) => {
          state.widgets.unregister(payload.pluginId, payload.widgetId);
          return { success: true };
        },
      }),
    ],

    dataSources: ({ state }) => [
      defineDataSource({
        id: "dashboard",
        name: "Dashboard DataSource",
        description: "Aggregates dashboard widgets from all plugins",
        fetch: async () => state.dashboard.getDashboardData(),
      }),
    ],

    interactions: ({ config }) => [
      {
        id: "dashboard",
        label: "Dashboard",
        description:
          "Explore this brain's public identity, knowledge, network, and system health.",
        href: config.routePath,
        kind: "human",
        priority: 30,
        visibility: "public",
      },
    ],

    routes: ({ config }) => [
      defineRoute({
        method: "GET",
        path: config.routePath,
        security: { kind: "public" },
        response: verbatim,
        handle: ({ request }) => renderDashboard(held, config, request),
      }),
      defineRoute({
        method: "GET",
        path: "/api/console/jump",
        security: { kind: "public" },
        response: verbatim,
        handle: ({ request }) => answerConsoleJump(held, config, request),
      }),
      ...assetRoutes(config),
    ],
  });
}

/** The asset files the page loads, derived from config alone. */
function assetRoutes(
  config: z.output<typeof dashboardConfigSchema>,
): AnyInterfaceRouteDefinition[] {
  return new DashboardAssetRegistry(config.routePath)
    .createRoutes({
      ...(config.themeCSS !== undefined && { themeCSS: config.themeCSS }),
    })
    .map((asset) =>
      defineRoute({
        method: "GET",
        path: asset.path,
        security: { kind: "public" },
        response: verbatim,
        handle: ({ request }) => asset.serve(request),
      }),
    );
}

async function renderDashboard(
  state: DashboardState | undefined,
  config: z.output<typeof dashboardConfigSchema>,
  request: Request,
): Promise<Response> {
  if (!state) {
    return new Response("Dashboard unavailable", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { reads } = state;
  const principal = await reads.auth.getCaller()?.resolveSession(request);
  const requestUrl = new URL(request.url);
  const doors = reads.surfaces({
    permissionLevel: principal?.permissionLevel ?? "public",
    hasActiveSession: principal !== undefined,
    selfHref: config.routePath,
  });
  const studioPath = doors.find((door) => door.id === "studio")?.href;
  if (
    principal &&
    studioPath &&
    requestUrl.searchParams.get("view") !== "public"
  ) {
    return new Response(null, {
      status: 302,
      headers: { Location: studioPath, "Cache-Control": "no-store" },
    });
  }
  const askHref = doors.find((door) => door.id === "web-chat")?.href;

  // The card is invariant across sessions. Public providers always see an
  // anonymous Public caller, and non-public providers never run.
  const visibleWidgets = state.widgets.list({ permissionLevel: "public" });
  const [dashboardData, appInfo, publicEntityCounts] = await Promise.all([
    state.dashboard.getDashboardData({
      permissionLevel: "public",
      widgets: visibleWidgets,
      providerContext: { caller: null, signal: request.signal },
    }),
    reads.identity.getAppInfo(),
    reads.entities.getEntityCounts("public"),
  ]);

  const baseUrl =
    reads.siteUrl ??
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
        PermissionService.hasPermission("public", interaction.visibility) &&
        interaction.requiresActiveSession !== true,
    ),
  };

  const profile = reads.identity.getProfile();
  const returnTo = studioPath ?? `${requestUrl.pathname}${requestUrl.search}`;
  const encodedReturnTo = encodeURIComponent(returnTo);
  const resolved = resolveWidgetsForRender(
    dashboardData.widgets,
    state.widgets,
  );

  const input: DashboardRenderInput = {
    title: profile.name || "Public Brain",
    baseUrl,
    widgets: resolved.widgets,
    widgetStyles: resolved.widgetStyles,
    widgetScripts: resolved.widgetScripts,
    assetUrls: state.assetUrls,
    dashboardPath: config.routePath,
    ...(askHref ? { askHref } : {}),
    character: reads.identity.get(),
    profile,
    appInfo: visibleAppInfo,
    ...(config.themeCSS !== undefined && { themeCSS: config.themeCSS }),
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
}

async function answerConsoleJump(
  state: DashboardState | undefined,
  config: z.output<typeof dashboardConfigSchema>,
  request: Request,
): Promise<Response> {
  if (!state) return Response.json({ groups: [] });

  const { reads } = state;
  const principal = await reads.auth.getCaller()?.resolveSession(request);
  if (!principal) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (principal.permissionLevel !== "admin") {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  let entities: ConsoleJumpEntityHit[] = [];
  if (query.length >= 2) {
    // Only the search is tolerated: it degrades to no entity doors while the
    // index warms. Shaping the rows below is ours, and a fault there is not a
    // warming index.
    let results;
    try {
      results = await reads.entities.search({ query, options: { limit: 6 } });
    } catch {
      results = undefined;
    }
    if (results) {
      entities = results.map((result) => {
        const title = Reflect.get(result.entity, "title");
        return {
          entityType: result.entity.entityType,
          id: result.entity.id,
          title: typeof title === "string" ? title : result.entity.id,
        };
      });
    }
  }

  const studioPath = reads
    .surfaces({
      permissionLevel: principal.permissionLevel,
      hasActiveSession: true,
      selfHref: config.routePath,
    })
    .find((door) => door.id === "studio")?.href;

  return Response.json({
    groups: buildConsoleJumpGroups({
      query,
      dashboardPath: config.routePath,
      studioPath,
      entities,
    }),
  });
}
