import type { AppInfo, EntityCount } from "@brains/plugins";
import type { ConsoleSurface } from "@brains/console-theme";
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

export interface DashboardSessionPrincipal {
  displayName: string;
  role: "anchor" | "trusted" | "public";
  permissionLevel: "anchor" | "trusted" | "public";
}

export interface DashboardAuthAccess {
  principal?: DashboardSessionPrincipal;
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

export interface DashboardDirectorySyncStatus {
  syncPath: string;
  isInitialized: boolean;
  watchEnabled: boolean;
  lastSync?: string | undefined;
  totalFiles?: number | undefined;
  byEntityType?: Record<string, number> | undefined;
  managementUrl?: string | undefined;
}

export interface DashboardIndexStatus {
  ready: boolean;
  degraded?: boolean | undefined;
  activeEmbeddingJobs?: number | undefined;
  missingEmbeddings?: number | undefined;
  staleEmbeddings?: number | undefined;
  failedEmbeddings?: number | undefined;
  embeddableEntities?: number | undefined;
  embeddedEntities?: number | undefined;
}

export interface DashboardAssetUrls {
  dashboardStyles: string;
  dashboardScript: string;
  themeStyles?: string;
  widgetStyles: string[];
  widgetScripts: string[];
}

export interface DashboardRenderInput {
  title: string;
  baseUrl: string | undefined;
  widgets: Record<string, RenderableWidgetData>;
  widgetStyles?: string[];
  widgetScripts: string[];
  assetUrls?: DashboardAssetUrls;
  dashboardPath?: string;
  surfaces?: ConsoleSurface[];
  character: CharacterInput;
  profile: ProfileInput;
  appInfo: AppInfo;
  themeCSS?: string;
  activityLog?: DashboardActivityEvent[];
  jobProgress?: DashboardJobProgressItem[];
  indexReady?: boolean;
  indexStatus?: DashboardIndexStatus;
  directorySyncStatus?: DashboardDirectorySyncStatus;
  authAccess?: DashboardAuthAccess;
}

// exactOptionalPropertyTypes = true treats `x?: string` and
// `x: string | undefined` differently. The handler explicitly passes
// `baseUrl` (including when the value is undefined), so the shape
// above matches exactly what the handler builds.
