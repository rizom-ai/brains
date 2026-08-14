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

/**
 * Source-owned authorization for workspace providers: capabilities enforce
 * admin themselves instead of trusting the hosting surface's access gate.
 */
export function assertCmsWorkspaceAdmin(
  actor: { userPermissionLevel?: UserPermissionLevel | undefined },
  capability: string,
): void {
  if (actor.userPermissionLevel !== "admin") {
    throw new Error(`${capability} requires admin permission`);
  }
}

/** Optional server-side capability hosted by the first-party CMS. */
export type CmsWorkspaceRendererName =
  | "PublishingWorkspace"
  | "SiteWorkspace"
  | "DirectorySyncWorkspace"
  | "UnifiedInboxWorkspace";

export interface CmsWorkspaceRegistration {
  id: string;
  pluginId: string;
  label: string;
  rendererName: CmsWorkspaceRendererName;
  priority: number;
  /** Allow the CMS container to hydrate stable renderer-owned filters from the URL. */
  urlQuery?: true | undefined;
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
  dataProvider: (actor: CmsWorkspaceActor, query?: unknown) => Promise<unknown>;
  actionHandler?:
    | ((request: unknown, actor: CmsWorkspaceActor) => Promise<unknown>)
    | undefined;
  /** Bounded attention count shown in the workspace rail. */
  badgeProvider?:
    | ((
        actor: CmsWorkspaceActor,
      ) => number | undefined | Promise<number | undefined>)
    | undefined;
}

/** Serializable registration fields exposed to the CMS browser. */
export interface CmsWorkspaceDescriptor {
  id: string;
  pluginId: string;
  label: string;
  rendererName: CmsWorkspaceRendererName;
  priority: number;
  urlQuery?: true | undefined;
  entityTypes: string[];
  badge?: number | undefined;
}

export interface CmsWorkspaceRegistrationResult {
  workspaceUrl: string;
}
