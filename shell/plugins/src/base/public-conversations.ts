import {
  coerceConversationMetadata,
  type Conversation as RuntimeConversation,
  type Message as RuntimeMessage,
} from "@brains/conversation-service";
import {
  messageRoleSchema,
  type Conversation,
  type Message,
  type MessageRole,
} from "../contracts/conversations";

function toPublicRole(role: string): MessageRole {
  const result = messageRoleSchema.safeParse(role);
  return result.success ? result.data : "user";
}

export function toPublicConversation(
  conversation: RuntimeConversation,
): Conversation {
  const metadata = coerceConversationMetadata(conversation.metadata);
  const channelName =
    typeof metadata["channelName"] === "string"
      ? metadata["channelName"]
      : undefined;

  return {
    id: conversation.id,
    sessionId: conversation.sessionId,
    interfaceType: conversation.interfaceType,
    channelId: conversation.channelId,
    channelName,
    startedAt: conversation.started,
    lastActiveAt: conversation.lastActive,
    createdAt: conversation.created,
    updatedAt: conversation.updated,
    metadata,
  };
}

export function toPublicMessage(message: RuntimeMessage): Message {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: toPublicRole(message.role),
    content: message.content,
    timestamp: message.timestamp,
    metadata: coerceConversationMetadata(message.metadata),
  };
}
