/**
 * Discord Message Components
 *
 * The one raw Discord REST call the chat interface makes: stripping the
 * button components off a posted message (used when an approval card is
 * resolved). Failures are logged at debug and swallowed — a stale button
 * is cosmetic, never worth failing the turn.
 */

import { getThreadIdParts } from "./discord-routing";

const DISCORD_API_BASE = "https://discord.com/api/v10";

/** Structural fetch (Bun's `typeof fetch` drags in `preconnect`). */
export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

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
