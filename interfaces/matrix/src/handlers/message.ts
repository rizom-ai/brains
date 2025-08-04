import type { MessageContext } from "@brains/messaging-service";
import type { Logger } from "@brains/plugins";
import { markdownToHtml } from "@brains/utils";
import type { MatrixClientWrapper } from "../client/matrix-client";
import type { MatrixConfig } from "../schemas";

/**
 * Send a message using Matrix client
 */
export async function sendMessage(
  content: string,
  context: MessageContext,
  client: MatrixClientWrapper | undefined,
  config: MatrixConfig,
  replyToId?: string,
): Promise<string> {
  if (!client) {
    throw new Error("Matrix client not initialized");
  }

  const roomId = context.channelId;
  const html = markdownToHtml(content);

  // Send with threading if enabled and replying
  if (config.enableThreading && replyToId) {
    return client.sendReply(roomId, replyToId, content, html);
  } else {
    return client.sendFormattedMessage(roomId, content, html, true);
  }
}

/**
 * Edit an existing message
 */
export async function editMessage(
  messageId: string,
  content: string,
  context: MessageContext,
  client: MatrixClientWrapper | undefined,
): Promise<void> {
  if (!client) {
    throw new Error("Matrix client not initialized");
  }

  const roomId = context.channelId;
  const html = markdownToHtml(content);

  await client.editMessage(roomId, messageId, content, html);
}

/**
 * Send an error message
 */
export async function sendErrorMessage(
  roomId: string,
  replyToEventId: string,
  error: unknown,
  client: MatrixClientWrapper | undefined,
  config: MatrixConfig,
): Promise<void> {
  const errorMessage =
    error instanceof Error ? error.message : "An unknown error occurred";
  const response = `❌ **Error:** ${errorMessage}`;

  const html = markdownToHtml(response);

  if (!client) {
    throw new Error("Matrix client not initialized");
  }

  if (config.enableThreading) {
    await client.sendReply(roomId, replyToEventId, response, html);
  } else {
    await client.sendFormattedMessage(roomId, response, html, true);
  }
}

/**
 * Check if the message is addressed to this bot
 */
export function isAddressedToBot(
  event: {
    content?: {
      "m.mentions"?: {
        user_ids?: string[];
      };
    };
  },
  botUserId: string,
  logger: Logger,
): boolean {
  const userIds = event.content?.["m.mentions"]?.user_ids;
  const isAddressed = userIds?.includes(botUserId) ?? false;

  logger.debug("Checking if bot is addressed", {
    botUserId,
    mentionedUserIds: userIds,
    isAddressed,
  });

  return isAddressed;
}
