import type { UserPermissionLevel } from "@brains/plugins";
import { studioWorkspacePath } from "./studio-paths";

export const STUDIO_CHAT_WORKSPACE_ID = "web-chat:chat";
export const STUDIO_CHAT_WORKSPACE_RENDERER = "StudioChatWorkspace";

export interface StudioChatWorkspaceDescriptor {
  readonly id: typeof STUDIO_CHAT_WORKSPACE_ID;
  readonly pluginId: "studio";
  readonly label: "Chat";
  readonly rendererName: typeof STUDIO_CHAT_WORKSPACE_RENDERER;
  readonly priority: -80;
  readonly permission: "public";
  readonly urlQuery: true;
  readonly chatApiPath: string;
  readonly entityTypes: readonly [];
}

export function studioChatWorkspacePath(
  routePath: string,
  conversationId?: string,
): string {
  const pathname = studioWorkspacePath(routePath, STUDIO_CHAT_WORKSPACE_ID);
  if (!conversationId) return pathname;
  const search = new URLSearchParams({ session: conversationId });
  return `${pathname}?${search.toString()}`;
}

/**
 * Closed host-owned workspace; presence follows the resolved Chat capability.
 *
 * Open to every level. Studio's own door already requires an active session,
 * so "public" here means every signed-in visitor rather than everyone on the
 * internet, and a second gate at trusted only narrowed that further. The
 * permission level is still taken so the signature does not change under
 * callers that pass it.
 */
export function listBuiltInStudioChatWorkspaces(
  _permissionLevel: UserPermissionLevel,
  chatApiPath: string | undefined,
): StudioChatWorkspaceDescriptor[] {
  if (!chatApiPath) return [];
  return [
    {
      id: STUDIO_CHAT_WORKSPACE_ID,
      pluginId: "studio",
      label: "Chat",
      rendererName: STUDIO_CHAT_WORKSPACE_RENDERER,
      priority: -80,
      permission: "public",
      urlQuery: true,
      chatApiPath,
      entityTypes: [],
    },
  ];
}
