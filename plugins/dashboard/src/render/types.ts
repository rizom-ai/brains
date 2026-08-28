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
  organization?: string | undefined;
  description?: string | undefined;
  website?: string | undefined;
  email?: string | undefined;
  socialLinks?:
    | readonly {
        platform: "github" | "instagram" | "linkedin" | "email" | "website";
        url: string;
        label?: string | undefined;
      }[]
    | undefined;
}

export interface RenderableWidgetData extends WidgetData {
  component?: WidgetComponent | undefined;
}

export interface DashboardSessionPrincipal {
  displayName: string;
  role: "admin" | "trusted" | "public";
  permissionLevel: "admin" | "trusted" | "public";
}

export interface DashboardAuthAccess {
  principal?: DashboardSessionPrincipal;
  loginUrl: string;
  logoutUrl: string;
}

export interface DashboardAssetUrls {
  dashboardStyles: string;
  dashboardScript: string;
  themeStyles?: string;
}

export interface DashboardRenderInput {
  title: string;
  baseUrl: string | undefined;
  widgets: Record<string, RenderableWidgetData>;
  /** Client styles and scripts collected from first-party widget renderers. */
  widgetStyles?: string[];
  widgetScripts?: string[];
  assetUrls?: DashboardAssetUrls;
  dashboardPath?: string;
  surfaces?: ConsoleSurface[];
  character: CharacterInput;
  profile: ProfileInput;
  appInfo: AppInfo;
  themeCSS?: string;
  authAccess?: DashboardAuthAccess;
}

// exactOptionalPropertyTypes = true treats `x?: string` and
// `x: string | undefined` differently. The handler explicitly passes
// `baseUrl` (including when the value is undefined), so the shape
// above matches exactly what the handler builds.
