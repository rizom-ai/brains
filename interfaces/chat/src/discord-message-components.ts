/**
 * Discord Message Components
 *
 * The raw Discord REST calls the chat interface makes: stripping the
 * button components off a posted message (used when an approval card is
 * resolved), and reacting to a message a space notice is about. Failures
 * are logged at debug and swallowed — a stale button or a missing reaction
 * is cosmetic, never worth failing the turn.
 */

import type { FetchLike } from "@brains/utils/fetch-like";
import { getThreadIdParts } from "./discord-routing";

const DISCORD_API_BASE = "https://discord.com/api/v10";

export async function clearDiscordMessageComponents(input: {
  threadId: string;
  messageId: string;
  botToken: string;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
  };
  fetchFn?: FetchLike;
}): Promise<void> {
  const ids = getThreadIdParts(input.threadId);
  const channelId = ids.threadId ?? ids.channelId;
  if (!channelId) return;
  const fetchFn = input.fetchFn ?? fetch;
  try {
    const response = await fetchFn(
      `${DISCORD_API_BASE}/channels/${channelId}/messages/${input.messageId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${input.botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ components: [] }),
      },
    );
    if (!response.ok) {
      input.logger.debug("Failed to clear Discord message components", {
        messageId: input.messageId,
        channelId,
        status: response.status,
      });
    }
  } catch (error) {
    input.logger.debug("Failed to clear Discord message components", {
      error,
      messageId: input.messageId,
      channelId,
    });
  }
}

/**
 * React to a message as the bot (e.g. 📌 on a message a space notice is
 * about). Failures are logged at debug and swallowed: a missing reaction is
 * cosmetic.
 */
export async function addDiscordReaction(input: {
  threadId: string;
  messageId: string;
  emoji: string;
  botToken: string;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
  };
  fetchFn?: FetchLike;
}): Promise<void> {
  const ids = getThreadIdParts(input.threadId);
  const channelId = ids.threadId ?? ids.channelId;
  if (!channelId) return;
  const fetchFn = input.fetchFn ?? fetch;
  try {
    const response = await fetchFn(
      `${DISCORD_API_BASE}/channels/${channelId}/messages/${input.messageId}/reactions/${encodeURIComponent(input.emoji)}/@me`,
      {
        method: "PUT",
        headers: { Authorization: `Bot ${input.botToken}` },
      },
    );
    if (!response.ok) {
      input.logger.debug("Failed to add Discord reaction", {
        messageId: input.messageId,
        channelId,
        status: response.status,
      });
    }
  } catch (error) {
    input.logger.debug("Failed to add Discord reaction", {
      error,
      messageId: input.messageId,
      channelId,
    });
  }
}
