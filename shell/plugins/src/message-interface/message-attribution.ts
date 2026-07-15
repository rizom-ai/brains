import type { ActorRef } from "@brains/contracts";
import type {
  ConversationMessageActor,
  ConversationMessageSource,
} from "@brains/conversation-service";

export interface MessageActorInput {
  identity: ActorRef;
  interfaceType: string;
  role?: "user" | "assistant";
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
    identity: input.identity,
    interfaceType: input.interfaceType,
    role: input.role ?? "user",
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.username ? { username: input.username } : {}),
    ...(input.isBot !== undefined
      ? { isBot: normalizeBotFlag(input.isBot) }
      : {}),
  };
}

function normalizeBotFlag(value: boolean | string): boolean {
  if (typeof value === "boolean") return value;
  return value.toLowerCase() === "true";
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
