import type { UserPermissionLevel } from "@brains/plugins";

export const STUDIO_ACCOUNT_WORKSPACE_ID = "studio:account";
export const STUDIO_ACCOUNT_WORKSPACE_RENDERER = "StudioAccountWorkspace";

interface StudioAccountWorkspaceDefinition {
  readonly id: typeof STUDIO_ACCOUNT_WORKSPACE_ID;
  readonly pluginId: "studio";
  readonly label: string;
  readonly rendererName: typeof STUDIO_ACCOUNT_WORKSPACE_RENDERER;
  readonly priority: number;
  readonly permission: UserPermissionLevel;
  readonly entityTypes: readonly [];
}

export interface StudioAccountWorkspaceDescriptor {
  readonly id: typeof STUDIO_ACCOUNT_WORKSPACE_ID;
  readonly pluginId: "studio";
  readonly label: string;
  readonly rendererName: typeof STUDIO_ACCOUNT_WORKSPACE_RENDERER;
  readonly priority: number;
  readonly entityTypes: readonly [];
}

/**
 * Host-owned because its passkey ceremony needs fixed browser code. It is still
 * a normal Studio workspace for routing, navigation, and admission.
 */
export const STUDIO_ACCOUNT_WORKSPACE: StudioAccountWorkspaceDefinition = {
  id: STUDIO_ACCOUNT_WORKSPACE_ID,
  pluginId: "studio",
  label: "Account",
  rendererName: STUDIO_ACCOUNT_WORKSPACE_RENDERER,
  priority: 0,
  permission: "public",
  entityTypes: [],
};

const permissionRank: Record<UserPermissionLevel, number> = {
  public: 0,
  trusted: 1,
  admin: 2,
};

export function listBuiltInStudioWorkspaces(
  permissionLevel: UserPermissionLevel,
): StudioAccountWorkspaceDescriptor[] {
  if (
    permissionRank[permissionLevel] <
    permissionRank[STUDIO_ACCOUNT_WORKSPACE.permission]
  ) {
    return [];
  }
  return [
    {
      id: STUDIO_ACCOUNT_WORKSPACE.id,
      pluginId: STUDIO_ACCOUNT_WORKSPACE.pluginId,
      label: STUDIO_ACCOUNT_WORKSPACE.label,
      rendererName: STUDIO_ACCOUNT_WORKSPACE.rendererName,
      priority: STUDIO_ACCOUNT_WORKSPACE.priority,
      entityTypes: STUDIO_ACCOUNT_WORKSPACE.entityTypes,
    },
  ];
}
