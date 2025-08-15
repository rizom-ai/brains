import type { MessageContext } from "@brains/messaging-service";
import type { Logger } from "@brains/plugins";
import type { UserPermissionLevel } from "@brains/permission-service";
import type { MatrixClientWrapper } from "../client/matrix-client";
import type { MatrixConfig } from "../schemas";
import { isAddressedToBot, sendErrorMessage } from "./message";

export interface MatrixEventHandlerContext {
  client: MatrixClientWrapper;
  config: MatrixConfig;
  logger: Logger;
  handleInput: (
    input: string,
    context: MessageContext,
    replyToId?: string,
  ) => Promise<void>;
  determineUserPermissionLevel?: (
    interfaceType: string,
    userId: string,
  ) => UserPermissionLevel;
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
    // Create message context - permission level will be determined by handleInput
    const messageContext: MessageContext = {
      userId: senderId,
      channelId: roomId,
      messageId: eventId,
      timestamp: new Date(),
      interfaceType: "matrix",
      userPermissionLevel: "public", // Default, will be overridden by handleInput
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

  // Check permissions using centralized permission service
  if (ctx.determineUserPermissionLevel) {
    const userPermissionLevel = ctx.determineUserPermissionLevel(
      "matrix",
      inviter,
    );

    // Only accept invites from anchor users
    if (userPermissionLevel !== "anchor") {
      ctx.logger.info("Ignoring room invite from non-anchor user", {
        roomId,
        inviter,
        permissionLevel: userPermissionLevel,
      });
      return;
    }
  } else {
    // If no permission service is available, log warning but accept invite
    ctx.logger.warn("No permission service available, accepting invite", {
      roomId,
      inviter,
    });
  }

  try {
    await ctx.client.joinRoom(roomId);
    ctx.logger.info("Joined room after invite from anchor user", {
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
