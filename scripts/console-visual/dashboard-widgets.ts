import { createElement, type ReactElement } from "react";
import {
  ProximityMap,
  proximityMapDataSchema,
  proximityMapScript,
  proximityMapWidgetStyles,
} from "@brains/agent-discovery/proximity-map";
import type { DashboardWidgetRendering } from "./dashboard-fixture";

function VisualProximityWidget({
  data,
}: {
  data: unknown;
}): ReactElement | null {
  const parsed = proximityMapDataSchema.safeParse(data);
  return parsed.success
    ? createElement(ProximityMap, { data: parsed.data })
    : null;
}

/** The registered proximity map the captured Dashboard draws. */
export const dashboardWidgetRendering: DashboardWidgetRendering = {
  proximityComponent: VisualProximityWidget,
  widgetStyles: [proximityMapWidgetStyles],
  widgetScripts: [proximityMapScript],
};
