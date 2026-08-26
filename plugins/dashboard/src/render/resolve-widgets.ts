import type { DashboardWidgetRegistry } from "../widget-registry";
import type { WidgetData } from "../widget-schema";
import type { RenderableWidgetData } from "./types";

export interface ResolvedWidgets {
  widgets: Record<string, RenderableWidgetData>;
  widgetStyles: string[];
  widgetScripts: string[];
}

/**
 * Reunites each widget's fetched data with the renderer its plugin registered.
 * Components live in the registry, never in the widget payload, so a widget's
 * data stays serializable and only the host can hand a component to the page.
 */
export function resolveWidgetsForRender(
  widgets: Record<string, WidgetData>,
  registry: DashboardWidgetRegistry | null,
): ResolvedWidgets {
  const resolvedWidgets: Record<string, RenderableWidgetData> = {};
  const widgetStyles = new Set<string>();
  const widgetScripts = new Set<string>();

  for (const [key, widget] of Object.entries(widgets)) {
    const renderer = registry?.get(
      widget.widget.pluginId,
      widget.widget.id,
    )?.renderer;

    resolvedWidgets[key] = {
      ...widget,
      ...(renderer ? { component: renderer.component } : {}),
    };

    if (renderer?.clientStyles) {
      widgetStyles.add(renderer.clientStyles);
    }
    if (renderer?.clientScript) {
      widgetScripts.add(renderer.clientScript);
    }
  }

  return {
    widgets: resolvedWidgets,
    widgetStyles: Array.from(widgetStyles),
    widgetScripts: Array.from(widgetScripts),
  };
}
