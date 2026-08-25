import {
  safeParseRuntimeDashboardWidgetData,
  type RuntimeDashboardOperatorPanelBlock,
} from "@brains/plugins";
import type { RenderableWidgetData } from "./types";

export type CartesianMapBlock = Extract<
  RuntimeDashboardOperatorPanelBlock,
  { type: "spatial"; layout: "cartesian" }
>;
export type RadialMapBlock = Extract<
  RuntimeDashboardOperatorPanelBlock,
  { type: "spatial"; layout: "radial" }
>;
type ListBlock = Extract<RuntimeDashboardOperatorPanelBlock, { type: "list" }>;

function orderedWidgets(
  widgets: Record<string, RenderableWidgetData>,
): RenderableWidgetData[] {
  return Object.values(widgets).sort(
    (left, right) =>
      left.widget.priority - right.widget.priority ||
      left.widget.pluginId.localeCompare(right.widget.pluginId) ||
      left.widget.id.localeCompare(right.widget.id),
  );
}

export function widgetPanelBlocks(
  widget: RenderableWidgetData,
): RuntimeDashboardOperatorPanelBlock[] {
  const parsed = safeParseRuntimeDashboardWidgetData(widget.data);
  if (!parsed.success) return [];
  return parsed.data.view.blocks.flatMap((block) =>
    block.type === "tabs"
      ? block.tabs.flatMap((tab) => [...tab.blocks])
      : [block],
  );
}

export function findCartesianMap(
  widgets: Record<string, RenderableWidgetData>,
): CartesianMapBlock | undefined {
  for (const widget of orderedWidgets(widgets)) {
    const block = widgetPanelBlocks(widget).find(
      (candidate): candidate is CartesianMapBlock =>
        candidate.type === "spatial" && candidate.layout === "cartesian",
    );
    if (block) return block;
  }
  return undefined;
}

export function findRadialMap(
  widgets: Record<string, RenderableWidgetData>,
): RadialMapBlock | undefined {
  for (const widget of orderedWidgets(widgets)) {
    const block = widgetPanelBlocks(widget).find(
      (candidate): candidate is RadialMapBlock =>
        candidate.type === "spatial" && candidate.layout === "radial",
    );
    if (block) return block;
  }
  return undefined;
}

export function findSkills(
  widgets: Record<string, RenderableWidgetData>,
): ListBlock["items"] {
  const skillWidget = orderedWidgets(widgets).find(
    (widget) => widget.widget.id === "skills",
  );
  if (!skillWidget) return [];
  return (
    widgetPanelBlocks(skillWidget).find(
      (block): block is ListBlock => block.type === "list",
    )?.items ?? []
  );
}

export function overviewContributions(
  widgets: Record<string, RenderableWidgetData>,
): RenderableWidgetData[] {
  return orderedWidgets(widgets).filter(
    (widget) =>
      widget.widget.id !== "skills" &&
      !widgetPanelBlocks(widget).some((block) => block.type === "spatial"),
  );
}
