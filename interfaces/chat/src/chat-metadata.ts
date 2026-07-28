import type { AuthPrincipal } from "@brains/auth-service";
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
  principal?: AuthPrincipal,
): Record<string, unknown> {
  return {
    actor: buildChatActorMetadata(
      platform,
      {
        userId: message.author.userId,
        userName: message.author.userName,
        fullName: message.author.fullName,
        isBot: message.author.isBot,
      },
      principal,
    ),
    source: buildChatSourceMetadata(thread, {
      messageId: message.id,
      channelName: getChannelName(thread),
      ...(metadata ? { metadata } : {}),
    }),
  };
}

/**
 * Metadata for a message captured passively into a space conversation. The
 * source is channel-scoped rather than thread-scoped: `channelId` is the
 * space's own id, with the originating thread recorded alongside it.
 */
export function buildChatSpaceMessageMetadata(
  platform: string,
  thread: RoutedThread,
  spaceThreadId: string,
  message: ChatMetadataMessage,
  principal?: AuthPrincipal,
): Record<string, unknown> {
  const ids = getThreadIdParts(thread.id);
  return {
    actor: buildChatActorMetadata(
      platform,
      {
        userId: message.author.userId,
        userName: message.author.userName,
        fullName: message.author.fullName,
        isBot: message.author.isBot,
      },
      principal,
    ),
    source: buildMessageSourceMetadata({
      messageId: message.id,
      channelId: spaceThreadId,
      channelName: getChannelName(thread),
      ...(ids.threadId ? { threadId: ids.threadId } : {}),
      metadata: {
        ...(ids.guildId ? { guildId: ids.guildId } : {}),
      },
    }),
  };
}

export function buildChatActionEventMetadata(
  platform: string,
  thread: RoutedThread,
  event: ChatMetadataActionEvent,
  principal?: AuthPrincipal,
): Record<string, unknown> {
  return {
    actor: buildChatActorMetadata(
      platform,
      {
        userId: event.user.userId,
        userName: event.user.userName,
        fullName: event.user.fullName,
        isBot: event.user.isBot,
      },
      principal,
    ),
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

/**
 * A speaker bound to a brain account is attributed to that account, so their
 * messages stay linked across interfaces. Unbound speakers keep the
 * platform-scoped external id.
 */
function buildChatActorMetadata(
  platform: string,
  actor: ChatActorInput,
  principal: AuthPrincipal | undefined,
): ConversationMessageActor {
  return buildMessageActorMetadata({
    identity: principal
      ? {
          kind: "user",
          userId: principal.userId,
          ...(principal.canonicalId
            ? { canonicalId: principal.canonicalId }
            : {}),
        }
      : {
          kind: "external",
          externalActorId: createExternalActorId(platform, actor.userId),
        },
    interfaceType: platform,
    displayName: principal?.displayName ?? (actor.fullName || actor.userName),
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
