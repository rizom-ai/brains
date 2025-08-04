import type { MessageContext } from "@brains/messaging-service";
import type { Logger } from "@brains/plugins";
import type { MatrixClientWrapper } from "../client/matrix-client";
import type { MatrixConfig } from "../schemas";
import type { PermissionHandler } from "@brains/utils";
import { isAddressedToBot, sendErrorMessage } from "./message";

export interface MatrixEventHandlerContext {
  client: MatrixClientWrapper;
  config: MatrixConfig;
  logger: Logger;
  permissionHandler: PermissionHandler;
  handleInput: (
    input: string,
    context: MessageContext,
    replyToId?: string,
  ) => Promise<void>;
  determineUserPermissionLevel: (
    userId: string,
  ) => "anchor" | "trusted" | "public";
}

/**
 * Handle room message events
 */
export async function handleRoomMessage(
  roomId: string,
  event: unknown,
  ctx: MatrixEventHandlerContext,
): Promise<void> {
  const messageEvent = event as {
    sender?: string;
    content?: {
      msgtype?: string;
      body?: string;
      formatted_body?: string;
      format?: string;
      "m.mentions"?: {
        user_ids?: string[];
      };
    };
    event_id?: string;
  };

  // Ignore our own messages
  if (messageEvent.sender === ctx.config.userId) {
    return;
  }

  // Extract message details
  const senderId = messageEvent.sender ?? "unknown";
  const eventId = messageEvent.event_id ?? "unknown";
  const msgtype = messageEvent.content?.msgtype;
  const message = messageEvent.content?.body;

  // Only process text messages
  if (msgtype !== "m.text" || !message) {
    return;
  }

  // Check if bot is mentioned (only for non-anchor users)
  if (senderId !== ctx.config.anchorUserId) {
    if (!isAddressedToBot(messageEvent, ctx.config.userId, ctx.logger)) {
      ctx.logger.debug("Message not addressed to bot, ignoring", {
        roomId,
        senderId,
      });
      return;
    }
  }

  // Strip bot mention from message if present
  const mentionPattern = new RegExp(`^${ctx.config.userId}[,:;]?\\s*`);
  const cleanMessage = message.replace(mentionPattern, "").trim();

  ctx.logger.info("Processing message", {
    roomId,
    senderId,
    eventId,
    message: cleanMessage.substring(0, 100), // Log first 100 chars
  });

  try {
    // Get permission level
    const permissionLevel =
      ctx.permissionHandler.getUserPermissionLevel(senderId);

    ctx.logger.info("Determined permission level", {
      senderId,
      permissionLevel,
      roomId,
      messageLength: message.length,
    });


    // Set typing indicator
    if (ctx.config.enableTypingNotifications) {
      await ctx.client.setTyping(roomId, true);
    }

    // Add thinking reaction
    if (ctx.config.enableReactions) {
      await ctx.client.sendReaction(roomId, eventId, "🤔");
    }

    // Create message context - let shell handle permission checking
    const messageContext: MessageContext = {
      userId: senderId,
      channelId: roomId,
      messageId: eventId,
      timestamp: new Date(),
      interfaceType: "matrix",
      userPermissionLevel: ctx.determineUserPermissionLevel(senderId),
    };

    // Check if message is an anchor-only command
    if (message.startsWith(ctx.config.anchorPrefix)) {
      // Only process if sender is the anchor user
      if (senderId !== ctx.config.anchorUserId) {
        throw new Error("This command is restricted to the anchor user");
      }
    }

    // Process the message using the base class method with mapping
    await ctx.handleInput(message, messageContext, eventId);

    // Add done reaction
    if (ctx.config.enableReactions) {
      await ctx.client.sendReaction(roomId, eventId, "✅");
    }
  } catch (error) {
    ctx.logger.error("Error handling message", { error, roomId, eventId });
    await sendErrorMessage(roomId, eventId, error, ctx.client, ctx.config);
  } finally {
    // Stop typing indicator
    if (ctx.config.enableTypingNotifications) {
      await ctx.client.setTyping(roomId, false);
    }
  }
}

/**
 * Handle room invite events
 */
export async function handleRoomInvite(
  roomId: string,
  event: unknown,
  ctx: MatrixEventHandlerContext,
): Promise<void> {
  const inviteEvent = event as {
    sender?: string;
  };

  const inviter = inviteEvent.sender ?? "unknown";

  ctx.logger.info("Received room invite", {
    roomId,
    inviter,
  });

  // Only accept invites from anchor or trusted users
  const permissionLevel = ctx.permissionHandler.getUserPermissionLevel(inviter);
  if (permissionLevel === "public") {
    ctx.logger.warn("Rejecting invite from public user", {
      roomId,
      inviter,
    });
    return;
  }

  try {
    await ctx.client.joinRoom(roomId);
    ctx.logger.info("Joined room after invite", {
      roomId,
      inviter,
    });
  } catch (error) {
    ctx.logger.error("Failed to join room", {
      error,
      roomId,
      inviter,
    });
  }
}
