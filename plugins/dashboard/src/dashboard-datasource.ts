import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { getErrorMessage, z } from "@brains/utils";
import {
  WIDGET_RENDERERS,
  type DashboardWidgetRegistry,
  type DashboardWidgetMeta,
} from "./widget-registry";

/**
 * Widget data as returned by the datasource
 */
export interface WidgetData {
  widget: DashboardWidgetMeta;
  data: unknown;
}

/**
 * Dashboard data schema
 */
export const dashboardDataSchema = z.object({
  widgets: z.record(
    z.object({
      widget: z.object({
        id: z.string(),
        pluginId: z.string(),
        title: z.string(),
        description: z.string().optional(),
        priority: z.number(),
        section: z.enum(["primary", "secondary", "sidebar"]),
        rendererName: z.enum(WIDGET_RENDERERS),
      }),
      data: z.unknown(),
    }),
  ),
  buildInfo: z.object({
    timestamp: z.string(),
    version: z.string(),
  }),
});

export type DashboardData = z.infer<typeof dashboardDataSchema>;

/**
 * Dashboard DataSource
 *
 * Aggregates data from all registered widgets for site-builder rendering.
 * Each widget's dataProvider is called and the results are collected.
 */
export class DashboardDataSource implements DataSource {
  readonly id = "dashboard:dashboard";
  readonly name = "Dashboard DataSource";
  readonly description = "Aggregates dashboard widgets from all plugins";

  private registry: DashboardWidgetRegistry;
  private logger: Logger;

  constructor(registry: DashboardWidgetRegistry, logger: Logger) {
    this.registry = registry;
    this.logger = logger.child("DashboardDataSource");
  }

  async fetch<T>(
    _query: unknown,
    _outputSchema: z.ZodSchema<T>,
    _context: BaseDataSourceContext,
  ): Promise<T> {
    const widgets: Record<string, WidgetData> = {};
    const registeredWidgets = this.registry.list();

    for (const widget of registeredWidgets) {
      const key = `${widget.pluginId}:${widget.id}`;

      try {
        const data = await widget.dataProvider();

        // Extract metadata without dataProvider (rendererName stays in output)
        const { dataProvider: _, ...widgetMeta } = widget;

        widgets[key] = {
          widget: widgetMeta,
          data,
        };
      } catch (error) {
        this.logger.error("Widget data provider failed", {
          widgetId: widget.id,
          pluginId: widget.pluginId,
          error: getErrorMessage(error),
        });
        // Skip widgets that fail - don't include them in results
      }
    }

    const result: DashboardData = {
      widgets,
      buildInfo: {
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
    };

    return result as T;
  }
}
