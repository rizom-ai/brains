import type { ActorRef } from "@brains/contracts";
import type { ContentVisibility } from "@brains/entity-service";
import type { UserPermissionLevel } from "@brains/templates";

export const STUDIO_WORKSPACE_REGISTER_MESSAGE = "studio:register-workspace";
export const STUDIO_WORKSPACE_UNREGISTER_MESSAGE =
  "studio:unregister-workspace";
export const DECLARATIVE_STUDIO_WORKSPACE_RENDERER =
  "DeclarativeOperatorWorkspace";

export interface StudioWorkspaceActor {
  interfaceType: "studio";
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
export function assertStudioWorkspaceAdmin(
  actor: { userPermissionLevel?: UserPermissionLevel | undefined },
  capability: string,
): void {
  if (actor.userPermissionLevel !== "admin") {
    throw new Error(`${capability} requires admin permission`);
  }
}

/** Optional server-side capability hosted by the first-party Studio. */
export type StudioWorkspaceRendererName =
  typeof DECLARATIVE_STUDIO_WORKSPACE_RENDERER;

/** One retired workspace id and the stable query state of its replacement. */
export interface StudioWorkspaceAlias {
  id: string;
  query: Readonly<Record<string, string>>;
}

export interface StudioWorkspaceRegistration {
  id: string;
  pluginId: string;
  label: string;
  rendererName: StudioWorkspaceRendererName;
  priority: number;
  /**
   * Host-enforced permission floor. The Studio registry defaults omitted floors
   * to Trusted so a permissive source handler cannot widen existing access.
   */
  permission?: UserPermissionLevel | undefined;
  /** Allow the Studio container to hydrate stable renderer-owned filters from the URL. */
  urlQuery?: true | undefined;
  /** Retired workspace ids that the browser resolves to this workspace. */
  aliases?: readonly StudioWorkspaceAlias[] | undefined;
  /**
   * Entity types the workspace covers. Providers whose coverage depends on
   * the caller's permissions supply a resolver so descriptors never disclose
   * types the actor cannot act on.
   */
  entityTypes?:
    | string[]
    | ((actor: StudioWorkspaceActor) => string[] | Promise<string[]>)
    | undefined;
  accessHandler: (actor: StudioWorkspaceActor) => boolean | Promise<boolean>;
  dataProvider: (
    actor: StudioWorkspaceActor,
    query?: unknown,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  actionHandler?:
    | ((
        request: unknown,
        actor: StudioWorkspaceActor,
        signal?: AbortSignal,
      ) => Promise<unknown>)
    | undefined;
  /** Bounded attention count shown in the workspace rail. */
  badgeProvider?:
    | ((
        actor: StudioWorkspaceActor,
      ) => number | undefined | Promise<number | undefined>)
    | undefined;
}

/** Serializable registration fields exposed to the Studio browser. */
export interface StudioWorkspaceDescriptor {
  id: string;
  pluginId: string;
  label: string;
  rendererName: StudioWorkspaceRendererName;
  priority: number;
  urlQuery?: true | undefined;
  aliases?: readonly StudioWorkspaceAlias[] | undefined;
  entityTypes: string[];
  badge?: number | undefined;
}

export interface StudioWorkspaceRegistrationResult {
  workspaceUrl: string;
}

export interface StudioWorkspaceUnregistration {
  pluginId: string;
  workspaceId?: string | undefined;
}
