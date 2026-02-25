import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";

/**
 * Function that provides widget data asynchronously
 */
export type WidgetDataProvider = () => Promise<unknown>;

/**
 * Available widget renderer names
 *
 * TODO: Future enhancement - support dynamic renderer resolution
 * Currently renderers are resolved via static lookup in the dashboard layout.
 * To support plugin-provided custom renderers:
 * 1. Allow plugins to register renderer components at runtime
 * 2. Use dynamic imports or a client-side registry
 * 3. Consider server-side rendering API for custom renderers
 */
export const WIDGET_RENDERERS = [
  "StatsWidget",
  "ListWidget",
  "CustomWidget",
] as const;
export type WidgetRendererName = (typeof WIDGET_RENDERERS)[number];

/**
 * Dashboard widget schema - validates widget metadata
 */
export const dashboardWidgetSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.number().default(50),
  section: z.enum(["primary", "secondary", "sidebar"]).default("primary"),
  rendererName: z.enum(WIDGET_RENDERERS),
});

export type DashboardWidgetMeta = z.infer<typeof dashboardWidgetSchema>;

/**
 * Registered widget with metadata and data provider
 */
export interface RegisteredWidget extends DashboardWidgetMeta {
  dataProvider: WidgetDataProvider;
}

/**
 * Dashboard Widget Registry
 *
 * Manages widget registration from plugins. Each plugin can register
 * multiple widgets that contribute to the central dashboard.
 */
export class DashboardWidgetRegistry {
  private widgets = new Map<string, RegisteredWidget>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child("DashboardWidgetRegistry");
  }

  /**
   * Register a dashboard widget
   */
  register(widget: RegisteredWidget): void {
    const key = `${widget.pluginId}:${widget.id}`;
    this.widgets.set(key, widget);
    this.logger.debug("Dashboard widget registered", {
      key,
      title: widget.title,
    });
  }

  /**
   * Unregister widget(s) for a plugin
   * @param pluginId - The plugin ID
   * @param widgetId - Optional specific widget ID. If not provided, removes all widgets for the plugin
   */
  unregister(pluginId: string, widgetId?: string): void {
    if (widgetId) {
      this.widgets.delete(`${pluginId}:${widgetId}`);
    } else {
      for (const key of this.widgets.keys()) {
        if (key.startsWith(`${pluginId}:`)) {
          this.widgets.delete(key);
        }
      }
    }
  }

  /**
   * List widgets, optionally filtered by section
   * @param section - Optional section filter
   * @returns Widgets sorted by priority (lower = first)
   */
  list(section?: "primary" | "secondary" | "sidebar"): RegisteredWidget[] {
    return Array.from(this.widgets.values())
      .filter((w) => !section || w.section === section)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get the number of registered widgets
   */
  get size(): number {
    return this.widgets.size;
  }
}
