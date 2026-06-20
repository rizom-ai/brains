import type {
  ConversationMessageActor,
  ConversationMessageSource,
} from "@brains/conversation-service";

export interface MessageActorInput {
  interfaceType: string;
  actorId: string;
  role?: "user" | "assistant";
  canonicalId?: string;
  displayName?: string;
  username?: string;
  isBot?: boolean | string;
}

export interface MessageSourceInput {
  channelId?: string;
  channelName?: string;
  messageId?: string;
  threadId?: string;
  metadata?: Record<string, unknown>;
}

export function buildMessageActorMetadata(
  input: MessageActorInput,
): ConversationMessageActor {
  return {
    actorId: input.actorId,
    interfaceType: input.interfaceType,
    role: input.role ?? "user",
    ...(input.canonicalId ? { canonicalId: input.canonicalId } : {}),
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.username ? { username: input.username } : {}),
    ...(input.isBot !== undefined ? { isBot: Boolean(input.isBot) } : {}),
  };
}

export function buildMessageSourceMetadata(
  input: MessageSourceInput,
): ConversationMessageSource {
  return {
    ...(input.messageId ? { messageId: input.messageId } : {}),
    ...(input.channelId ? { channelId: input.channelId } : {}),
    ...(input.channelName ? { channelName: input.channelName } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}
