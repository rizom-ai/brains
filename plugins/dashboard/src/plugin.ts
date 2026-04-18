import type {
  Tool,
  ServicePluginContext,
  WebRouteDefinition,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { getErrorMessage, z } from "@brains/utils";
import { DashboardWidgetRegistry, WIDGET_RENDERERS } from "./widget-registry";
import type { RegisteredWidget } from "./widget-registry";
import { DashboardDataSource } from "./dashboard-datasource";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "./dashboard-page";
import packageJson from "../package.json";

/**
 * Dashboard plugin configuration schema
 */
const dashboardConfigSchema = z.object({
  version: z.string().default("1.0.0"),
  routePath: z.string().default("/dashboard"),
});

type DashboardConfig = z.infer<typeof dashboardConfigSchema>;

/**
 * Schema for widget registration message payload
 */
const registerWidgetPayloadSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.number().default(50),
  section: z.enum(["primary", "secondary", "sidebar"]).default("primary"),
  rendererName: z.enum(WIDGET_RENDERERS),
  dataProvider: z.function().returns(z.promise(z.unknown())),
});

/**
 * Schema for widget unregistration message payload
 */
const unregisterWidgetPayloadSchema = z.object({
  pluginId: z.string(),
  widgetId: z.string().optional(),
});

/**
 * Dashboard Plugin
 *
 * Provides a central dashboard where plugins can contribute widgets.
 * Plugins register widgets via messaging, and the dashboard aggregates
 * and serves the data through a datasource.
 */
export class DashboardPlugin extends ServicePlugin<DashboardConfig> {
  private widgetRegistry: DashboardWidgetRegistry | null = null;
  private datasource: DashboardDataSource | null = null;
  private siteUrl: string | undefined;
  private ctx: ServicePluginContext | undefined;

  constructor(config?: Partial<DashboardConfig>) {
    super("dashboard", packageJson, config ?? {}, dashboardConfigSchema);
  }

  /**
   * Register the plugin and set up message subscriptions
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Capture the public site URL so the dashboard can resolve
    // relative endpoint URLs to absolute form at render time, and keep
    // the context around so the handler can read shell state (identity,
    // profile, appInfo, entity counts) directly at render time. The
    // dashboard no longer wraps shell state in internal "system widgets" —
    // widgets are reserved for plugin-contributed cards.
    this.siteUrl = context.siteUrl;
    this.ctx = context;

    // Initialize widget registry — only external plugin widgets live here.
    this.widgetRegistry = new DashboardWidgetRegistry(this.logger);

    // Initialize and register datasource
    this.datasource = new DashboardDataSource(this.widgetRegistry, this.logger);
    context.entities.registerDataSource(this.datasource);

    // Subscribe to widget registration messages
    context.messaging.subscribe(
      "dashboard:register-widget",
      async (message) => {
        try {
          const payload = registerWidgetPayloadSchema.parse(message.payload);
          const widget: RegisteredWidget = {
            id: payload.id,
            pluginId: payload.pluginId,
            title: payload.title,
            description: payload.description,
            priority: payload.priority,
            section: payload.section,
            rendererName: payload.rendererName,
            dataProvider: payload.dataProvider as () => Promise<unknown>,
          };
          this.widgetRegistry?.register(widget);
          this.logger.debug("Widget registered via messaging", {
            widgetId: payload.id,
            pluginId: payload.pluginId,
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

    // Subscribe to widget unregistration messages
    context.messaging.subscribe(
      "dashboard:unregister-widget",
      async (message) => {
        const payload = unregisterWidgetPayloadSchema.parse(message.payload);
        this.widgetRegistry?.unregister(payload.pluginId, payload.widgetId);
        this.logger.debug("Widget unregistered via messaging", {
          pluginId: payload.pluginId,
          widgetId: payload.widgetId,
        });
        return { success: true };
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

          const [dashboardData, appInfo, entityCounts] = await Promise.all([
            this.datasource.getDashboardData(),
            ctx.appInfo(),
            ctx.entityService.getEntityCounts(),
          ]);
          const character = ctx.identity.get();
          const profile = ctx.identity.getProfile();

          // Prefer the configured siteUrl (honors reverse proxies / public
          // domains); fall back to the request's origin for local dev.
          const baseUrl =
            this.siteUrl ??
            (() => {
              try {
                return new URL(request.url).origin;
              } catch {
                return undefined;
              }
            })();

          // Handler owns the fallback chain: the brand's name is the
          // profile, or the brain's configured name via appInfo.model,
          // or a generic default. Renderer stays dumb.
          const title = profile.name || appInfo.model || "Brain Dashboard";

          const input: DashboardRenderInput = {
            title,
            baseUrl,
            widgets: dashboardData.widgets,
            character,
            profile,
            appInfo,
            entityCounts,
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

  /**
   * Get the widget registry (for testing/internal use)
   */
  getWidgetRegistry(): DashboardWidgetRegistry | null {
    return this.widgetRegistry;
  }
}

export function dashboardPlugin(
  config?: Partial<DashboardConfig>,
): DashboardPlugin {
  return new DashboardPlugin(config);
}
