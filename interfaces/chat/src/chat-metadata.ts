import { createExternalActorId } from "@brains/contracts";
import {
  buildCoalescedInput,
  buildMessageActorMetadata,
  buildMessageSourceMetadata,
  type ConversationMessageActor,
} from "@brains/plugins";
import {
  getChannelName,
  getThreadIdParts,
  type RoutedThread,
} from "./discord-routing";

interface ChatActorInput {
  userId: string;
  userName: string;
  fullName: string;
  isBot: boolean | string;
}

interface ChatMetadataMessage {
  id: string;
  author: ChatActorInput;
}

interface ChatMetadataActionEvent {
  actionId: string;
  value?: string | undefined;
  messageId: string;
  user: ChatActorInput;
}

interface ChatCoalescedContext {
  skipped: Array<{
    id: string;
    text: string;
    author: { fullName: string; userName: string };
  }>;
}

export function getChatConversationId(
  platform: string,
  threadId: string,
): string {
  return `${platform}-${threadId}`;
}

export function buildChatCoalescedAgentInput(
  message: string,
  context?: ChatCoalescedContext,
): { message: string; metadata?: Record<string, unknown> } {
  const coalesced = buildCoalescedInput({
    message,
    skippedMessages: (context?.skipped ?? []).map((skippedMessage) => ({
      id: skippedMessage.id,
      text: skippedMessage.text,
      authorName:
        skippedMessage.author.fullName || skippedMessage.author.userName,
    })),
  });
  return coalesced.metadata
    ? { message: coalesced.message, metadata: { ...coalesced.metadata } }
    : { message: coalesced.message };
}

export function buildChatUserMessageMetadata(
  platform: string,
  thread: RoutedThread,
  message: ChatMetadataMessage,
  metadata?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    actor: buildChatActorMetadata(platform, {
      userId: message.author.userId,
      userName: message.author.userName,
      fullName: message.author.fullName,
      isBot: message.author.isBot,
    }),
    source: buildChatSourceMetadata(thread, {
      messageId: message.id,
      channelName: getChannelName(thread),
      ...(metadata ? { metadata } : {}),
    }),
  };
}

export function buildChatActionEventMetadata(
  platform: string,
  thread: RoutedThread,
  event: ChatMetadataActionEvent,
): Record<string, unknown> {
  return {
    actor: buildChatActorMetadata(platform, {
      userId: event.user.userId,
      userName: event.user.userName,
      fullName: event.user.fullName,
      isBot: event.user.isBot,
    }),
    source: buildChatSourceMetadata(thread, {
      messageId: event.messageId,
      channelName: getChannelName(thread),
      metadata: {
        actionId: event.actionId,
        ...(event.value ? { actionValue: event.value } : {}),
      },
    }),
  };
}

function buildChatActorMetadata(
  platform: string,
  actor: ChatActorInput,
): ConversationMessageActor {
  return buildMessageActorMetadata({
    identity: {
      kind: "external",
      externalActorId: createExternalActorId(platform, actor.userId),
    },
    interfaceType: platform,
    displayName: actor.fullName || actor.userName,
    username: actor.userName,
    isBot: actor.isBot,
  });
}

function buildChatSourceMetadata(
  thread: RoutedThread,
  input: {
    messageId: string;
    channelName: string;
    metadata?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const ids = getThreadIdParts(thread.id);
  return buildMessageSourceMetadata({
    messageId: input.messageId,
    channelId: thread.id,
    channelName: input.channelName,
    ...(ids.threadId ? { threadId: ids.threadId } : {}),
    metadata: {
      ...(input.metadata ?? {}),
      ...(ids.guildId ? { guildId: ids.guildId } : {}),
    },
  });
}
