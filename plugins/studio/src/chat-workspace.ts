import type { UserPermissionLevel } from "@brains/plugins";
export const STUDIO_CHAT_ROUTE_PATH = "/chat";
export const STUDIO_CHAT_WORKSPACE_ID = "web-chat:chat";
export const STUDIO_CHAT_WORKSPACE_RENDERER = "StudioChatWorkspace";

export interface StudioChatWorkspaceDescriptor {
  readonly id: typeof STUDIO_CHAT_WORKSPACE_ID;
  readonly pluginId: "studio";
  readonly label: "Chat";
  readonly rendererName: typeof STUDIO_CHAT_WORKSPACE_RENDERER;
  readonly priority: -80;
  readonly permission: "trusted";
  readonly urlQuery: true;
  readonly chatApiPath: string;
  readonly entityTypes: readonly [];
}

const permissionRank: Record<UserPermissionLevel, number> = {
  public: 0,
  trusted: 1,
  admin: 2,
};

export function studioChatWorkspacePath(
  _routePath: string,
  conversationId?: string,
): string {
  if (!conversationId) return STUDIO_CHAT_ROUTE_PATH;
  const search = new URLSearchParams({ session: conversationId });
  return `${STUDIO_CHAT_ROUTE_PATH}?${search.toString()}`;
}

/** Closed host-owned workspace; presence follows the resolved Chat capability. */
export function listBuiltInStudioChatWorkspaces(
  permissionLevel: UserPermissionLevel,
  chatApiPath: string | undefined,
): StudioChatWorkspaceDescriptor[] {
  if (
    !chatApiPath ||
    permissionRank[permissionLevel] < permissionRank.trusted
  ) {
    return [];
  }
  return [
    {
      id: STUDIO_CHAT_WORKSPACE_ID,
      pluginId: "studio",
      label: "Chat",
      rendererName: STUDIO_CHAT_WORKSPACE_RENDERER,
      priority: -80,
      permission: "trusted",
      urlQuery: true,
      chatApiPath,
      entityTypes: [],
    },
  ];
}
