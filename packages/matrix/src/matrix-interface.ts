import {
  BaseInterface,
  type InterfaceContext,
  type MessageContext,
} from "@brains/interface-core";
import { matrixConfigSchema } from "./schemas";
import type { MatrixConfig } from "./types";
import { MatrixClientWrapper } from "./client/matrix-client";
import { PermissionHandler } from "@brains/interface-core";
import { MarkdownFormatter } from "./formatters/markdown-formatter";

/**
 * Matrix interface for Personal Brain
 * Provides chat-based interaction through Matrix protocol
 */
export class MatrixInterface extends BaseInterface {
  private client?: MatrixClientWrapper;
  private permissionHandler?: PermissionHandler;
  private markdownFormatter: MarkdownFormatter;
  private config: MatrixConfig;

  constructor(context: InterfaceContext, config: MatrixConfig) {
    super(context);
    this.config = matrixConfigSchema.parse(config);
    this.markdownFormatter = new MarkdownFormatter();
  }

  /**
   * Start the interface
   */
  async start(): Promise<void> {
    // Create permission handler
    this.permissionHandler = new PermissionHandler(
      this.config.anchorUserId,
      this.config.trustedUsers,
    );

    // Create Matrix client
    this.client = new MatrixClientWrapper(this.config, this.logger);

    // Set up event handlers
    this.setupEventHandlers();

    this.logger.info("Starting Matrix interface...");
    await this.client.start();
    this.logger.info("Matrix interface started", {
      userId: this.config.userId,
      anchorUserId: this.config.anchorUserId,
      trustedUsers: this.config.trustedUsers?.length ?? 0,
    });
  }

  /**
   * Stop the interface
   */
  async stop(): Promise<void> {
    if (!this.client) {
      return;
    }

    this.logger.info("Stopping Matrix interface...");
    await this.client.stop();
    this.logger.info("Matrix interface stopped");
  }

  /**
   * Handle local commands
   */
  protected async handleLocalCommand(
    _command: string,
    _context: MessageContext,
  ): Promise<string | null> {
    // Matrix doesn't have local commands in Phase 1
    return null;
  }

  /**
   * Set up Matrix event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) {
      return;
    }

    // Handle room messages
    this.client.on("room.message", (...args: unknown[]) => {
      const [roomId, event] = args as [string, unknown];
      // Process the message asynchronously
      void this.handleRoomMessage(roomId, event);
    });

    // Handle room invites (if auto-join is disabled)
    if (!this.config.autoJoinRooms) {
      this.client.on("room.invite", (...args: unknown[]) => {
        const [roomId, event] = args as [string, unknown];
        // Process the invite asynchronously
        void this.handleRoomInvite(roomId, event);
      });
    }
  }

  /**
   * Handle room message events
   */
  private async handleRoomMessage(
    roomId: string,
    event: unknown,
  ): Promise<void> {
    const messageEvent = event as {
      sender?: string;
      content?: { msgtype?: string; body?: string };
      event_id?: string;
    };

    // Ignore our own messages
    if (messageEvent.sender === this.config.userId) {
      return;
    }

    // Only handle text messages for now
    if (messageEvent.content?.msgtype !== "m.text") {
      return;
    }

    // Process the message
    await this.handleMessage(roomId, messageEvent);
  }

  /**
   * Handle room invite events
   */
  private async handleRoomInvite(
    roomId: string,
    event: unknown,
  ): Promise<void> {
    const inviteEvent = event as { sender?: string };

    this.logger.info("Received room invite", {
      roomId,
      inviter: inviteEvent.sender,
    });

    // For now, only accept invites from anchor user
    if (inviteEvent.sender === this.config.anchorUserId && this.client) {
      try {
        await this.client.joinRoom(roomId);
        this.logger.info("Joined room", { roomId });
      } catch (error) {
        this.logger.error("Failed to join room", { roomId, error });
      }
    }
  }

  /**
   * Handle incoming messages
   */
  private async handleMessage(
    roomId: string,
    event: {
      sender?: string;
      content?: { body?: string };
      event_id?: string;
    },
  ): Promise<void> {
    const senderId = event.sender;
    const message = event.content?.body;
    const eventId = event.event_id;

    if (!senderId || !message || !eventId) {
      this.logger.warn("Received incomplete message event", { roomId, event });
      return;
    }

    this.logger.debug("Received message", {
      roomId,
      senderId,
      message: message.substring(0, 100), // Log first 100 chars
      eventId,
    });

    try {
      // Get user permission level
      if (!this.permissionHandler) {
        throw new Error("Permission handler not initialized");
      }
      const permissionLevel =
        this.permissionHandler.getUserPermissionLevel(senderId);

      // Send typing indicator
      if (this.config.enableTypingNotifications && this.client) {
        await this.client.sendTyping(roomId, true);
      }

      // Add thinking reaction
      if (this.config.enableReactions && this.client) {
        await this.client.sendReaction(roomId, eventId, "🤔");
      }

      // Create message context
      const messageContext: MessageContext = {
        userId: senderId,
        channelId: roomId,
        messageId: eventId,
        timestamp: new Date(),
      };

      // Process the message
      const response = await this.processMessageWithContext(
        message,
        senderId,
        permissionLevel,
        messageContext,
      );

      // Send the response
      await this.sendResponse(roomId, eventId, response);

      // Add done reaction
      if (this.config.enableReactions && this.client) {
        await this.client.sendReaction(roomId, eventId, "✅");
      }
    } catch (error) {
      this.logger.error("Error handling message", { error, roomId, eventId });
      await this.sendErrorMessage(roomId, eventId, error);
    } finally {
      // Stop typing indicator
      if (this.config.enableTypingNotifications && this.client) {
        await this.client.sendTyping(roomId, false);
      }
    }
  }

  /**
   * Process a message and generate a response
   */
  private async processMessageWithContext(
    message: string,
    _senderId: string,
    _permissionLevel: string,
    messageContext: MessageContext,
  ): Promise<string> {
    // For Phase 1, use the processQuery method from BaseInterface
    // In future phases, we'll filter tools based on permission level
    return this.processQuery(message, messageContext);
  }

  /**
   * Send a response message
   */
  private async sendResponse(
    roomId: string,
    replyToEventId: string,
    response: string,
  ): Promise<void> {
    // Convert markdown to HTML
    const html = this.markdownFormatter.markdownToHtml(response);

    if (!this.client) {
      throw new Error("Matrix client not initialized");
    }

    // Send as a reply if threading is enabled
    if (this.config.enableThreading) {
      await this.client.sendReply(roomId, replyToEventId, response, html);
    } else {
      await this.client.sendFormattedMessage(roomId, response, html);
    }
  }

  /**
   * Send an error message
   */
  private async sendErrorMessage(
    roomId: string,
    replyToEventId: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    const response = `❌ **Error:** ${errorMessage}`;

    const html = this.markdownFormatter.markdownToHtml(response);

    if (!this.client) {
      throw new Error("Matrix client not initialized");
    }

    if (this.config.enableThreading) {
      await this.client.sendReply(roomId, replyToEventId, response, html);
    } else {
      await this.client.sendFormattedMessage(roomId, response, html, true);
    }
  }
}
