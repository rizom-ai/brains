import type { ActorRef } from "@brains/contracts";
import type { ContentVisibility } from "@brains/entity-service";
import type { UserPermissionLevel } from "@brains/templates";

export const CMS_WORKSPACE_REGISTER_MESSAGE = "cms:register-workspace";

export interface CmsWorkspaceActor {
  interfaceType: "cms";
  userId: string;
  actor: ActorRef;
  userPermissionLevel: UserPermissionLevel;
  visibilityScope: ContentVisibility;
  isAnchor: boolean;
}

/** Optional server-side capability hosted by the first-party CMS. */
export type CmsWorkspaceRendererName =
  | "PublishingWorkspace"
  | "SiteWorkspace"
  | "DirectorySyncWorkspace"
  | "EmailTriageWorkspace";

export interface CmsWorkspaceRegistration {
  id: string;
  pluginId: string;
  label: string;
  rendererName: CmsWorkspaceRendererName;
  priority: number;
  /**
   * Entity types the workspace covers. Providers whose coverage depends on
   * the caller's permissions supply a resolver so descriptors never disclose
   * types the actor cannot act on.
   */
  entityTypes?:
    | string[]
    | ((actor: CmsWorkspaceActor) => string[] | Promise<string[]>)
    | undefined;
  accessHandler: (actor: CmsWorkspaceActor) => boolean | Promise<boolean>;
  dataProvider: (actor: CmsWorkspaceActor) => Promise<unknown>;
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
