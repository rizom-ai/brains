import type {
  InterfacePluginContext,
  UserPermissionLevel,
} from "@brains/plugins";

type ConversationService = InterfacePluginContext["conversations"];
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
  if (conversation?.interfaceType !== interfaceType) {
    return false;
  }
  if (access.permissionLevel === "admin") return true;
  return (
    access.permissionLevel === "trusted" &&
    access.personId !== undefined &&
    conversation.personId === access.personId
  );
}
