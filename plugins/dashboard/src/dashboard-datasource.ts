import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { getErrorMessage } from "@brains/utils";
import type { z } from "@brains/utils";
import { type DashboardWidgetRegistry } from "./widget-registry";
import {
  type DashboardData,
  type WidgetData,
} from "./templates/dashboard/schema";

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

    // Fetch all widget data in parallel
    const results = await Promise.allSettled(
      registeredWidgets.map(async (widget) => {
        const data = await widget.dataProvider();
        const { dataProvider: _, ...widgetMeta } = widget;
        return {
          key: `${widget.pluginId}:${widget.id}`,
          widget: widgetMeta,
          data,
        };
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const widget = registeredWidgets[i];
      if (!result || !widget) continue;
      if (result.status === "fulfilled") {
        widgets[result.value.key] = {
          widget: result.value.widget,
          data: result.value.data,
        };
      } else {
        this.logger.error("Widget data provider failed", {
          widgetId: widget.id,
          pluginId: widget.pluginId,
          error: getErrorMessage(result.reason),
        });
      }
    }

    const result: DashboardData = {
      widgets,
    };

    return result as T;
  }
}
