/**
 * Discord Routing Policy
 *
 * Pure functions for Discord-specific routing decisions: composite
 * thread-id parsing, channel allow-lists, DM policy, and bot-created
 * thread detection. They read only the fields declared on the narrow
 * structural types below, so they are unit-testable without Chat SDK
 * fakes; real `Thread`/`Message` values are assignable.
 */

import type { PermissionLookupContext } from "@brains/sdk/internal/interface-runtime";
import { isBrainBotUserId } from "@brains/contracts";
import { isPlainRecord } from "@brains/utils/predicates";
import type {
  DiscordChatAdapterConfig,
  SlackChatAdapterConfig,
} from "./config";

/** The thread fields the routing policy reads. */
export interface RoutedThread {
  id: string;
  channelId: string;
  isDM: boolean;
}

/** The message fields the routing policy reads. */
export interface RoutedMessage {
  raw: unknown;
  /** `isBot` mirrors the Chat SDK's `Author`, which allows a string. */
  author: { userId: string; isMe: boolean; isBot: boolean | string };
  isMention?: boolean | undefined;
}

/** The adapter-config fields the routing policy reads. */
export type RoutingPolicyConfig = Pick<
  DiscordChatAdapterConfig | SlackChatAdapterConfig,
  "allowedChannels" | "allowDMs"
>;

export interface ThreadIdParts {
  guildId?: string;
  channelId?: string;
  threadId?: string;
}

/** Parse a composite `discord:<guild>:<channel>[:<thread>]` thread id. */
export function getThreadIdParts(threadId: string): ThreadIdParts {
  const parts = threadId.split(":");
  if (parts[0] !== "discord") return {};
  return {
    ...(parts[1] ? { guildId: parts[1] } : {}),
    ...(parts[2] ? { channelId: parts[2] } : {}),
    ...(parts[3] ? { threadId: parts[3] } : {}),
  };
}

/**
 * The channel-level thread id a space conversation is keyed by. Messages in a
 * Discord thread or a Slack thread belong to the parent channel's space, so a
 * space accumulates the whole channel rather than one thread of it.
 */
export function getSpaceThreadId(thread: RoutedThread): string {
  return thread.channelId;
}

/** The `<platform>:<channelId>` id that space selectors are matched against. */
export function getSpaceId(platform: string, thread: RoutedThread): string {
  const ids = getThreadIdParts(thread.id);
  return ids.channelId ? `${platform}:${ids.channelId}` : thread.channelId;
}

export function getRawDiscordChannelId(
  message: Pick<RoutedMessage, "raw">,
): string | undefined {
  const raw = message.raw;
  if (!isPlainRecord(raw)) return undefined;
  const value = raw["channel_id"];
  return typeof value === "string" ? value : undefined;
}

/**
 * A mention that arrives in the parent channel while the composite id
 * points at a thread means the bot created that thread for its reply.
 */
export function isBotCreatedDiscordThread(
  thread: RoutedThread,
  message: Pick<RoutedMessage, "raw">,
): boolean {
  if (thread.isDM) return false;
  const ids = getThreadIdParts(thread.id);
  if (!ids.threadId) return false;
  const rawChannelId = getRawDiscordChannelId(message);
  return rawChannelId !== undefined && rawChannelId !== ids.threadId;
}

/**
 * The platform's own channel id for Slack (`C123`) and Matrix
 * (`!room:server`, URL-encoded in the thread id), the form an operator
 * writes in allowedChannels and permission rules.
 */
function nativeChannelId(threadId: string): string | undefined {
  const [platform, channel] = threadId.split(":");
  if (!channel) return undefined;
  if (platform === "slack") return channel;
  if (platform === "matrix") return decodeURIComponent(channel);
  return undefined;
}

export function isAllowedChannel(
  thread: RoutedThread,
  config: Pick<RoutingPolicyConfig, "allowedChannels">,
): boolean {
  if (config.allowedChannels.length === 0 || thread.isDM) return true;
  const ids = getThreadIdParts(thread.id);
  return [
    thread.id,
    thread.channelId,
    ids.channelId,
    ids.threadId,
    nativeChannelId(thread.id),
  ].some((id) => typeof id === "string" && config.allowedChannels.includes(id));
}

/**
 * Whether the author is a bot. The Chat SDK's `isBot` may be a string: the
 * Matrix adapter reports `"unknown"` for everyone but itself, which is a
 * person as far as routing is concerned, except a brain's bot, `@_brain` on
 * any server. Two brains in a shared room then answer each other only when
 * mentioned, so neither can keep the other talking.
 */
export function isKnownBot(author: {
  userId: string;
  isBot: boolean | string;
}): boolean {
  return author.isBot === true || isBrainBotUserId(author.userId);
}

export function shouldRouteChatMessage(
  thread: RoutedThread,
  message: RoutedMessage,
  config: RoutingPolicyConfig,
): boolean {
  if (thread.isDM && !config.allowDMs) return false;
  if (message.author.isMe) return false;
  if (isKnownBot(message.author) && !message.isMention) return false;
  return isAllowedChannel(thread, config);
}

export function shouldHandleChatAction(
  thread: RoutedThread,
  config: RoutingPolicyConfig | undefined,
): boolean {
  if (!config) return false;
  if (thread.isDM && !config.allowDMs) return false;
  return isAllowedChannel(thread, config);
}

export function getPermissionContext(
  thread: RoutedThread,
  message: Pick<RoutedMessage, "author">,
): PermissionLookupContext {
  const ids = getThreadIdParts(thread.id);
  return {
    channelId: ids.channelId ?? nativeChannelId(thread.id) ?? thread.channelId,
    isBot: isKnownBot(message.author),
  };
}

export function getChannelName(thread: RoutedThread): string {
  return thread.isDM ? "DM" : thread.channelId;
}
