import type { DashboardWidgetRegistry } from "../widget-registry";
import type { WidgetData } from "../widget-schema";
import type { DashboardRenderInput, RenderableWidgetData } from "./types";

export interface ResolvedWidgets {
  widgets: Record<string, RenderableWidgetData>;
  widgetScripts: DashboardRenderInput["widgetScripts"];
}

export function resolveWidgetsForRender(
  widgets: Record<string, WidgetData>,
  registry: DashboardWidgetRegistry | null,
): ResolvedWidgets {
  const resolvedWidgets: Record<string, RenderableWidgetData> = {};
  const widgetScripts = new Set<string>();

  for (const [key, widget] of Object.entries(widgets)) {
    const registeredWidget = registry?.get(
      widget.widget.pluginId,
      widget.widget.id,
    );

    resolvedWidgets[key] = {
      ...widget,
      ...(registeredWidget?.component
        ? { component: registeredWidget.component }
        : {}),
    };

    if (registeredWidget?.clientScript) {
      widgetScripts.add(registeredWidget.clientScript);
    }
  }

  return {
    widgets: resolvedWidgets,
    widgetScripts: Array.from(widgetScripts),
  };
}
