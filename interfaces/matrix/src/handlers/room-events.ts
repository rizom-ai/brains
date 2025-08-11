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

  // Check if bot is mentioned - we'll pass this info to shouldRespond
  const isMentioned = isAddressedToBot(
    messageEvent,
    ctx.config.userId,
    ctx.logger,
  );

  // Strip bot mention from message if present
  const mentionPattern = new RegExp(`^${ctx.config.userId}[,:;]?\\s*`);
  const cleanMessage = message.replace(mentionPattern, "").trim();
  const messageToProcess = cleanMessage || message; // Use original if cleaning resulted in empty

  ctx.logger.info("Processing message", {
    roomId,
    senderId,
    eventId,
    message: messageToProcess.substring(0, 100), // Log first 100 chars
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

    // Create message context - pass mention info via threadId (hack for now)
    const messageContext: MessageContext = {
      userId: senderId,
      channelId: roomId,
      messageId: eventId,
      timestamp: new Date(),
      interfaceType: "matrix",
      userPermissionLevel: ctx.determineUserPermissionLevel(senderId),
      ...(isMentioned && { threadId: "mentioned" }), // Pass mention info only if mentioned
    };

    // Process the message using the base class method
    // The handleInput method will:
    // 1. Call shouldRespond to check if we should respond
    // 2. Call showThinkingIndicators if we should respond
    // 3. Process the message
    // 4. Call showDoneIndicators when complete
    await ctx.handleInput(messageToProcess, messageContext, eventId);
  } catch (error) {
    ctx.logger.error("Error handling message", { error, roomId, eventId });
    await sendErrorMessage(roomId, eventId, error, ctx.client, ctx.config);
  } finally {
    // Cleanup is handled by showDoneIndicators in MatrixInterface
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
