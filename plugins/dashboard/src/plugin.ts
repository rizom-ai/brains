import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import {
  ServicePlugin,
  createTypedTool,
  toolSuccess,
  toolError,
} from "@brains/plugins";
import { getErrorMessage, z } from "@brains/utils";
import { DashboardWidgetRegistry, WIDGET_RENDERERS } from "./widget-registry";
import type { RegisteredWidget } from "./widget-registry";
import {
  DashboardDataSource,
  dashboardDataSchema,
} from "./dashboard-datasource";
import { dashboardTemplate } from "./templates/dashboard";
import packageJson from "../package.json";

/**
 * Dashboard plugin configuration schema
 */
const dashboardConfigSchema = z.object({
  version: z.string().default("1.0.0"),
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
  public readonly dependencies = ["site-builder"];
  private widgetRegistry: DashboardWidgetRegistry | null = null;
  private datasource: DashboardDataSource | null = null;

  constructor(config?: Partial<DashboardConfig>) {
    super("dashboard", packageJson, config ?? {}, dashboardConfigSchema);
  }

  /**
   * Register the plugin and set up message subscriptions
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Initialize widget registry
    this.widgetRegistry = new DashboardWidgetRegistry(this.logger);

    // Initialize and register datasource
    this.datasource = new DashboardDataSource(this.widgetRegistry, this.logger);
    context.entities.registerDataSource(this.datasource);

    // Register dashboard template
    context.templates.register({ dashboard: dashboardTemplate });

    // Register dashboard route via site-builder messaging
    await context.messaging.send("plugin:site-builder:route:register", {
      pluginId: this.id,
      routes: [
        {
          id: "dashboard",
          path: "/dashboard",
          title: "System Dashboard",
          description: "Monitor your Brain system statistics and activity",
          layout: "minimal",
          navigation: {
            show: true,
            label: "Dashboard",
            slot: "secondary",
            priority: 100,
          },
          sections: [
            {
              id: "main",
              template: `${this.id}:dashboard`,
            },
          ],
        },
      ],
    });

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

  /**
   * Get plugin tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    return [
      createTypedTool(
        this.id,
        "get-data",
        "Get all dashboard widget data aggregated from plugins",
        z.object({}),
        async () => {
          if (!this.datasource || !this.context) {
            return toolError("Dashboard not initialized");
          }

          try {
            const data = await this.datasource.fetch({}, dashboardDataSchema, {
              entityService: this.context.entityService,
            });
            return toolSuccess(data, "Dashboard data retrieved");
          } catch (error) {
            const msg = getErrorMessage(error);
            return toolError(msg);
          }
        },
      ),
    ];
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
