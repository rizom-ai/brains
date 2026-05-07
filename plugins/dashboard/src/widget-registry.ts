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
export type WidgetVisibility = "public" | "operator";

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
  visibility: z.enum(["public", "operator"]).default("public"),
});

export type DashboardWidgetMeta = z.infer<typeof dashboardWidgetSchema>;
export type DashboardWidgetInput = z.input<typeof dashboardWidgetSchema>;

export interface RegisteredWidget extends DashboardWidgetInput {
  dataProvider: WidgetDataProvider;
  component?: WidgetComponent;
  clientScript?: string;
}

export interface StoredRegisteredWidget extends DashboardWidgetMeta {
  dataProvider: WidgetDataProvider;
  component?: WidgetComponent;
  clientScript?: string;
}

export class DashboardWidgetRegistry {
  private widgets = new Map<string, StoredRegisteredWidget>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child("DashboardWidgetRegistry");
  }

  register(widget: RegisteredWidget): void {
    const normalizedWidget: StoredRegisteredWidget = {
      ...widget,
      ...dashboardWidgetSchema.parse(widget),
    };
    const key = `${normalizedWidget.pluginId}:${normalizedWidget.id}`;
    this.widgets.set(key, normalizedWidget);
    this.logger.debug("Dashboard widget registered", {
      key,
      title: normalizedWidget.title,
      rendererName: normalizedWidget.rendererName,
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

  get(pluginId: string, widgetId: string): StoredRegisteredWidget | undefined {
    return this.widgets.get(`${pluginId}:${widgetId}`);
  }

  list(
    options:
      | "primary"
      | "secondary"
      | "sidebar"
      | {
          section?: "primary" | "secondary" | "sidebar";
          includeOperator?: boolean;
        } = {},
  ): StoredRegisteredWidget[] {
    const resolved =
      typeof options === "string" ? { section: options } : options;

    return Array.from(this.widgets.values())
      .filter(
        (widget) => !resolved.section || widget.section === resolved.section,
      )
      .filter(
        (widget) =>
          (resolved.includeOperator ?? false) ||
          widget.visibility !== "operator",
      )
      .sort((a, b) => a.priority - b.priority);
  }

  get size(): number {
    return this.widgets.size;
  }
}
