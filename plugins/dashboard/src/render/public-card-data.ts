import {
  safeParseRuntimeDashboardWidgetData,
  type RuntimeDashboardOperatorPanelBlock,
} from "@brains/plugins";
import type { RenderableWidgetData } from "./types";
import { isRecord } from "@brains/utils/is-record";

export type CartesianMapBlock = Extract<
  RuntimeDashboardOperatorPanelBlock,
  { type: "spatial"; layout: "cartesian" }
>;
export type RadialMapBlock = Extract<
  RuntimeDashboardOperatorPanelBlock,
  { type: "spatial"; layout: "radial" }
>;
type ListBlock = Extract<RuntimeDashboardOperatorPanelBlock, { type: "list" }>;

function declarativeWidgetData(data: unknown): unknown {
  if (!isRecord(data) || !("source" in data)) return data;
  return {
    view: data["view"],
    ...(data["digest"] !== undefined ? { digest: data["digest"] } : {}),
  };
}

export function widgetSourceData(data: unknown): unknown {
  return isRecord(data) && "source" in data ? data["source"] : data;
}

export function findRenderableWidget(
  widgets: Record<string, RenderableWidgetData>,
  pluginId: string,
  widgetId: string,
): RenderableWidgetData | undefined {
  return Object.values(widgets).find(
    (widget) =>
      widget.widget.pluginId === pluginId && widget.widget.id === widgetId,
  );
}

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
  const parsed = safeParseRuntimeDashboardWidgetData(
    declarativeWidgetData(widget.data),
  );
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
