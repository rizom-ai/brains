import type { InterfaceRuntime } from "@brains/sdk/internal/interface-runtime";
import type { UserPermissionLevel } from "@brains/plugins";

import { guestInterfaceType } from "@brains/contracts/chat";

type ConversationService = InterfaceRuntime["conversations"];
export type WebChatConversation = NonNullable<
  Awaited<ReturnType<ConversationService["get"]>>
>;

export interface WebChatConversationAccess {
  permissionLevel: UserPermissionLevel;
  personId?: string;
}

export function canAccessBrowserConversation(
  conversation: WebChatConversation | null,
  access: WebChatConversationAccess,
  interfaceType: string,
): conversation is WebChatConversation {
  if (
    conversation?.interfaceType === guestInterfaceType ||
    conversation?.interfaceType !== interfaceType
  ) {
    return false;
  }
  if (access.permissionLevel === "admin") return true;
  return (
    access.permissionLevel === "trusted" &&
    access.personId !== undefined &&
    conversation.personId === access.personId
  );
}
