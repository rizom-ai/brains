import { chunkMessage } from "@brains/utils/chunk-message";
import { CHAT_PLATFORMS, type ChatPlatform } from "./types";

const PLATFORM_MESSAGE_LIMITS: Partial<Record<ChatPlatform, number>> = {
  discord: 2000,
  slack: 4000,
};

/** The platform a channel id belongs to (the `<platform>:...` prefix), if known. */
export function parseChatPlatform(
  channelId: string | null,
): ChatPlatform | undefined {
  const platform = channelId?.split(":")[0];
  return CHAT_PLATFORMS.find((candidate) => candidate === platform);
}

/** Split a message into the platform's per-message size limit (no-op when unbounded). */
export function chunkForChannel(
  channelId: string | null,
  message: string,
): string[] {
  const platform = parseChatPlatform(channelId);
  const limit = platform ? PLATFORM_MESSAGE_LIMITS[platform] : undefined;
  return limit ? chunkMessage(message, limit) : [message];
}

/** Whether this interface owns an event for a configured chat adapter. */
export function ownsChatPlatform(
  interfaceType: string | undefined,
  enabledPlatforms: ReadonlySet<ChatPlatform>,
): boolean {
  const platform = CHAT_PLATFORMS.find(
    (candidate) => candidate === interfaceType,
  );
  return platform ? enabledPlatforms.has(platform) : false;
}
