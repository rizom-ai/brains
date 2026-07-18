import type { UserPermissionLevel } from "@brains/templates";

export const CMS_WORKSPACE_REGISTER_MESSAGE = "cms:register-workspace";

export interface CmsWorkspaceActor {
  interfaceType: "cms";
  userId: string;
  userPermissionLevel: UserPermissionLevel;
}

/** Optional server-side capability hosted by the first-party CMS. */
export type CmsWorkspaceRendererName =
  "PublishingWorkspace" | "SiteWorkspace" | "DirectorySyncWorkspace";

export interface CmsWorkspaceRegistration {
  id: string;
  pluginId: string;
  label: string;
  rendererName: CmsWorkspaceRendererName;
  priority: number;
  entityTypes?: string[] | undefined;
  dataProvider: () => Promise<unknown>;
  actionHandler?:
    | ((request: unknown, actor: CmsWorkspaceActor) => Promise<unknown>)
    | undefined;
}

/** Serializable registration fields exposed to the CMS browser. */
export interface CmsWorkspaceDescriptor {
  id: string;
  pluginId: string;
  label: string;
  rendererName: CmsWorkspaceRendererName;
  priority: number;
  entityTypes: string[];
}

export interface CmsWorkspaceRegistrationResult {
  workspaceUrl: string;
}
