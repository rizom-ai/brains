import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type {
  DashboardDigestLine,
  DashboardWidgetRegistry,
  StoredRegisteredWidget,
  WidgetVisibility,
} from "./widget-registry";
import { type DashboardData, type WidgetData } from "./widget-schema";

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

  async getDashboardData(
    options: {
      permissionLevel?: WidgetVisibility;
      widgets?: StoredRegisteredWidget[];
    } = {},
  ): Promise<DashboardData> {
    const widgets: Record<string, WidgetData> = {};
    const registeredWidgets =
      options.widgets ??
      this.registry.list({
        ...(options.permissionLevel !== undefined && {
          permissionLevel: options.permissionLevel,
        }),
      });

    // Fetch all widget data in parallel
    const results = await Promise.allSettled(
      registeredWidgets.map(async (widget) => {
        const data = await widget.dataProvider();
        const {
          dataProvider: _,
          digestProvider: _digestProvider,
          component: __,
          clientScript: ___,
          visibility = "public",
          ...widgetMeta
        } = widget;
        return {
          key: `${widget.pluginId}:${widget.id}`,
          widget: {
            ...widgetMeta,
            visibility,
            ...this.deriveLiveDigest(widget, data),
          },
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

    return {
      widgets,
    };
  }

  /**
   * Digest lines and operator counts are derived from the widget's fetched
   * data on every render, so Overview cards and tab badges stay live. The
   * statically registered values remain the fallback.
   */
  private deriveLiveDigest(
    widget: StoredRegisteredWidget,
    data: unknown,
  ): { digest?: DashboardDigestLine[]; needsOperator?: number } {
    if (!widget.digestProvider) return {};

    try {
      const derived = widget.digestProvider(data);
      return {
        ...(derived.digest !== undefined && { digest: derived.digest }),
        ...(derived.needsOperator !== undefined && {
          needsOperator: derived.needsOperator,
        }),
      };
    } catch (error) {
      this.logger.error("Widget digest provider failed", {
        widgetId: widget.id,
        pluginId: widget.pluginId,
        error: getErrorMessage(error),
      });
      return {};
    }
  }

  async fetch<T>(
    _query: unknown,
    _outputSchema: DataSourceSchema<T>,
    _context: BaseDataSourceContext,
  ): Promise<T> {
    return (await this.getDashboardData()) as T;
  }
}
