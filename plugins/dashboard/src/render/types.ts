import type { AppInfo } from "@brains/plugins";
import type { WidgetComponent } from "../widget-registry";
import type { WidgetData } from "../widget-schema";

export interface CharacterInput {
  role: string;
  purpose: string;
  values: string[];
}

export interface ProfileInput {
  name: string;
  description?: string | undefined;
}

export interface EntityCount {
  entityType: string;
  count: number;
}

export interface RenderableWidgetData extends WidgetData {
  component?: WidgetComponent;
}

export interface DashboardOperatorAccess {
  isOperator: boolean;
  hiddenWidgetCount: number;
  loginUrl: string;
}

export interface DashboardRenderInput {
  title: string;
  baseUrl: string | undefined;
  widgets: Record<string, RenderableWidgetData>;
  widgetScripts: string[];
  character: CharacterInput;
  profile: ProfileInput;
  appInfo: AppInfo;
  entityCounts: EntityCount[];
  operatorAccess?: DashboardOperatorAccess;
}

// exactOptionalPropertyTypes = true treats `x?: string` and
// `x: string | undefined` differently. The handler explicitly passes
// `baseUrl` (including when the value is undefined), so the shape
// above matches exactly what the handler builds.
