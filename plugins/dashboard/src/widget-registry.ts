import type { ComponentType } from "preact";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";

export interface WidgetComponentProps {
  title: string;
  description?: string;
  data: unknown;
}

export type WidgetComponent = ComponentType<WidgetComponentProps>;
export type WidgetDataProvider = () => Promise<unknown>;

export const BUILT_IN_WIDGET_RENDERERS = [
  "StatsWidget",
  "ListWidget",
  "CustomWidget",
  "PipelineWidget",
  "IdentityWidget",
  "ProfileWidget",
  "SystemWidget",
] as const;

export type BuiltInWidgetRendererName =
  (typeof BUILT_IN_WIDGET_RENDERERS)[number];

const builtInWidgetRendererSet = new Set<string>(BUILT_IN_WIDGET_RENDERERS);

export function isBuiltInWidgetRenderer(
  rendererName: string,
): rendererName is BuiltInWidgetRendererName {
  return builtInWidgetRendererSet.has(rendererName);
}

export const dashboardWidgetSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.number().default(50),
  section: z.enum(["primary", "secondary", "sidebar"]).default("primary"),
  rendererName: z.string(),
});

export type DashboardWidgetMeta = z.infer<typeof dashboardWidgetSchema>;

export interface RegisteredWidget extends DashboardWidgetMeta {
  dataProvider: WidgetDataProvider;
  component?: WidgetComponent;
  clientScript?: string;
}

export class DashboardWidgetRegistry {
  private widgets = new Map<string, RegisteredWidget>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child("DashboardWidgetRegistry");
  }

  register(widget: RegisteredWidget): void {
    const key = `${widget.pluginId}:${widget.id}`;
    this.widgets.set(key, widget);
    this.logger.debug("Dashboard widget registered", {
      key,
      title: widget.title,
      rendererName: widget.rendererName,
    });
  }

  unregister(pluginId: string, widgetId?: string): void {
    if (widgetId) {
      this.widgets.delete(`${pluginId}:${widgetId}`);
      return;
    }

    for (const key of this.widgets.keys()) {
      if (key.startsWith(`${pluginId}:`)) {
        this.widgets.delete(key);
      }
    }
  }

  get(pluginId: string, widgetId: string): RegisteredWidget | undefined {
    return this.widgets.get(`${pluginId}:${widgetId}`);
  }

  list(section?: "primary" | "secondary" | "sidebar"): RegisteredWidget[] {
    return Array.from(this.widgets.values())
      .filter((widget) => !section || widget.section === section)
      .sort((a, b) => a.priority - b.priority);
  }

  get size(): number {
    return this.widgets.size;
  }
}
