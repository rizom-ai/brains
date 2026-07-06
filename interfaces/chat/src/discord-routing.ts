/**
 * Discord Routing Policy
 *
 * Pure functions for Discord-specific routing decisions: composite
 * thread-id parsing, channel allow-lists, DM policy, and bot-created
 * thread detection. They read only the fields declared on the narrow
 * structural types below, so they are unit-testable without Chat SDK
 * fakes; real `Thread`/`Message` values are assignable.
 */

import type { PermissionLookupContext } from "@brains/plugins";
import type { DiscordChatAdapterConfig } from "./config";

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
  author: { isMe: boolean; isBot: boolean | string };
  isMention?: boolean | undefined;
}

/** The adapter-config fields the routing policy reads. */
export type RoutingPolicyConfig = Pick<
  DiscordChatAdapterConfig,
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

export function getRawDiscordChannelId(
  message: Pick<RoutedMessage, "raw">,
): string | undefined {
  const raw = message.raw;
  if (typeof raw !== "object" || raw === null) return undefined;
  const value = (raw as Record<string, unknown>)["channel_id"];
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

export function isAllowedChannel(
  thread: RoutedThread,
  config: Pick<RoutingPolicyConfig, "allowedChannels">,
): boolean {
  if (config.allowedChannels.length === 0 || thread.isDM) return true;
  const ids = getThreadIdParts(thread.id);
  return [thread.id, thread.channelId, ids.channelId, ids.threadId].some(
    (id) => typeof id === "string" && config.allowedChannels.includes(id),
  );
}

export function shouldRouteDiscordMessage(
  thread: RoutedThread,
  message: RoutedMessage,
  config: RoutingPolicyConfig,
): boolean {
  if (thread.isDM && !config.allowDMs) return false;
  if (message.author.isMe) return false;
  if (message.author.isBot && !message.isMention) return false;
  return isAllowedChannel(thread, config);
}

export function shouldHandleDiscordAction(
  thread: RoutedThread,
  platform: string,
  config: RoutingPolicyConfig | undefined,
): boolean {
  if (platform !== "discord") return true;
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
    channelId: ids.channelId ?? thread.channelId,
    isBot: Boolean(message.author.isBot),
  };
}

export function getChannelName(thread: RoutedThread): string {
  return thread.isDM ? "DM" : thread.channelId;
}
