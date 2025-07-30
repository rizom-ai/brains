import type { UserPermissionLevel } from "@brains/utils";

/**
 * Message context for interface operations
 * Used by message-based interfaces to provide context about the message
 */
export interface MessageContext {
  userId: string;
  channelId: string;
  messageId: string;
  timestamp: Date;
  interfaceType: string;
  userPermissionLevel: UserPermissionLevel;
  threadId?: string;
}
