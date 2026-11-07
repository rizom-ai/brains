import type { UserPermissionLevel } from "@brains/templates";
import type {
  DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
  StudioWorkspaceAlias,
} from "../contracts/studio-workspace-contracts";

export {
  DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
  type StudioWorkspaceActor,
  type StudioWorkspaceAlias,
  type StudioWorkspaceRegistration,
  type StudioWorkspaceRegistrationResult,
  type StudioWorkspaceUnregistration,
} from "../contracts/studio-workspace-contracts";

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

/** Serializable registration fields exposed to the Studio browser. */
export interface StudioWorkspaceDescriptor {
  id: string;
  pluginId: string;
  label: string;
  rendererName: StudioWorkspaceRendererName;
  priority: number;
  permission: UserPermissionLevel;
  urlQuery?: true | undefined;
  aliases?: readonly StudioWorkspaceAlias[] | undefined;
  entityTypes: string[];
  /** Studio sends publication actions for the covered entity types here. */
  publishesEntityTypes?: true | undefined;
  badge?: number | undefined;
}
