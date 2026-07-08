import type { AppInfo, EntityCount } from "@brains/plugins";
import type { WidgetComponent } from "../widget-registry";
import type { WidgetData } from "../widget-schema";

export type { EntityCount };

export interface CharacterInput {
  role: string;
  purpose: string;
  values: string[];
}

export interface ProfileInput {
  name: string;
  description?: string | undefined;
}

export interface RenderableWidgetData extends WidgetData {
  component?: WidgetComponent;
}

export interface DashboardOperatorAccess {
  isOperator: boolean;
  hiddenWidgetCount: number;
  loginUrl: string;
  logoutUrl: string;
}

export interface DashboardActivityEvent {
  action: "created" | "updated" | "deleted";
  entityType: string;
  entityId: string;
  timestamp: string;
  conversationId?: string | undefined;
}

export interface DashboardJobProgressItem {
  id: string;
  kind: "job" | "batch";
  status: "pending" | "processing" | "completed" | "failed";
  updatedAt: string;
  message?: string | undefined;
  jobType?: string | undefined;
  progressLabel?: string | undefined;
}

export interface DashboardRenderInput {
  title: string;
  baseUrl: string | undefined;
  widgets: Record<string, RenderableWidgetData>;
  widgetScripts: string[];
  dashboardPath?: string;
  character: CharacterInput;
  profile: ProfileInput;
  appInfo: AppInfo;
  themeCSS?: string;
  activityLog?: DashboardActivityEvent[];
  jobProgress?: DashboardJobProgressItem[];
  operatorAccess?: DashboardOperatorAccess;
}

// exactOptionalPropertyTypes = true treats `x?: string` and
// `x: string | undefined` differently. The handler explicitly passes
// `baseUrl` (including when the value is undefined), so the shape
// above matches exactly what the handler builds.
