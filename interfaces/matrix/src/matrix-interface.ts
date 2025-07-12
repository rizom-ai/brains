import {
  MessageInterfacePlugin,
  type MessageContext,
} from "@brains/message-interface";
import { PermissionHandler, markdownToHtml } from "@brains/utils";
import { matrixConfigSchema, MATRIX_CONFIG_DEFAULTS } from "./schemas";
import type { MatrixConfigInput, MatrixConfig } from "./schemas";
import { MatrixClientWrapper } from "./client/matrix-client";
import type { JobProgressEvent } from "@brains/job-queue";
import type { ProgressEventContext } from "@brains/db";
// MentionPill is for creating mentions, not detecting them
import packageJson from "../package.json";

/**
 * Matrix interface for Personal Brain
 * Provides chat-based interaction through Matrix protocol
 */
export class MatrixInterface extends MessageInterfacePlugin<MatrixConfigInput> {
  // After validation with defaults, config is complete
  declare protected config: MatrixConfig;
  private client?: MatrixClientWrapper;
  private permissionHandler?: PermissionHandler;

  constructor(config: MatrixConfigInput, sessionId?: string) {
    super(
      "matrix",
      packageJson,
      config,
      matrixConfigSchema,
      MATRIX_CONFIG_DEFAULTS,
      sessionId,
    );
  }

  /**
   * Matrix interface does not grant interface permissions - uses actual user permissions
   */

  /**
   * Start the interface
   */
  async start(): Promise<void> {
    if (!this.context) {
      throw new Error("Matrix interface must be registered before starting");
    }

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
   * Handle user input with Matrix-specific routing logic
   */
  protected override async handleInput(
    input: string,
    context: MessageContext,
  ): Promise<string> {
    // Check for anchor-only commands (!!command)
    if (input.startsWith(this.config.anchorPrefix)) {
      if (context.userId !== this.config.anchorUserId) {
        throw new Error("This command is restricted to the anchor user");
      }
      // Process as command but remove extra prefix
      const command = input.slice(this.config.anchorPrefix.length - 1);
      return this.executeCommand(command, context);
    }

    // Use default routing (commands start with /, everything else is query)
    return super.handleInput(input, context);
  }

  /**
   * Execute Matrix-specific commands
   */
  public override async executeCommand(
    command: string,
    context: MessageContext,
  ): Promise<string> {
    const [cmd, ...args] = command.slice(1).split(" ");

    switch (cmd) {
      case "join": {
        if (args.length === 0) return "Usage: /join <room-id>";
        const roomId = args[0];
        if (!roomId) return "Room ID is required";
        if (this.client) {
          await this.client.joinRoom(roomId);
          return `Joined room ${roomId}`;
        }
        return "Matrix client not available";
      }
      case "leave":
        // Could implement leave room logic here
        return "Leave room functionality not implemented yet";
      default:
        // Let parent handle unknown commands
        return super.executeCommand(command, context);
    }
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
    if (messageEvent.sender === this.config.userId) {
      return;
    }

    // Only handle text messages for now
    if (messageEvent.content?.msgtype !== "m.text") {
      return;
    }

    const messageBody = messageEvent.content.body;
    if (!messageBody) {
      return;
    }

    // Only respond if we're explicitly addressed or it's a command
    if (!this.isAddressedToBot(messageEvent) && !this.isCommand(messageBody)) {
      return;
    }

    // For anchor commands, check permission before processing
    if (
      messageBody.startsWith(this.config.anchorPrefix) &&
      messageEvent.sender !== this.config.anchorUserId
    ) {
      this.logger.debug("Ignoring anchor command from non-anchor user", {
        sender: messageEvent.sender,
        command: messageBody.substring(0, 50),
      });
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
      content?: {
        body?: string;
        "m.mentions"?: {
          user_ids?: string[];
        };
      };
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
      // Get user permission level and validate access
      if (!this.permissionHandler) {
        throw new Error("Permission handler not initialized");
      }
      const permissionLevel =
        this.permissionHandler.getUserPermissionLevel(senderId);

      // Log the interaction for audit purposes
      this.logger.debug("Processing message", {
        senderId,
        permissionLevel,
        roomId,
        messageLength: message.length,
      });

      if (!this.client) {
        throw new Error("Matrix client not initialized");
      }

      // Set typing indicator
      if (this.config.enableTypingNotifications) {
        await this.client.setTyping(roomId, true);
      }

      // Add thinking reaction
      if (this.config.enableReactions) {
        await this.client.sendReaction(roomId, eventId, "🤔");
      }

      // Create message context - let shell handle permission checking
      const messageContext: MessageContext = {
        userId: senderId,
        channelId: roomId,
        messageId: eventId,
        timestamp: new Date(),
        interfaceType: this.id,
        userPermissionLevel: this.determineUserPermissionLevel(senderId),
      };

      // Check if message is an anchor-only command
      if (message.startsWith(this.config.anchorPrefix)) {
        // Only process if sender is the anchor user
        if (senderId !== this.config.anchorUserId) {
          throw new Error("This command is restricted to the anchor user");
        }
      }

      // Process the message using our handleInput method
      const response = await this.handleInput(message, messageContext);

      // Send the response
      const sentEventId = await this.sendResponse(roomId, eventId, response);

      // Update the message context with the sent event ID for updates
      if (sentEventId) {
        messageContext.messageId = sentEventId;
      }

      // Add done reaction
      if (this.config.enableReactions) {
        await this.client.sendReaction(roomId, eventId, "✅");
      }
    } catch (error) {
      this.logger.error("Error handling message", { error, roomId, eventId });
      await this.sendErrorMessage(roomId, eventId, error);
    } finally {
      // Stop typing indicator
      if (this.config.enableTypingNotifications && this.client) {
        await this.client.setTyping(roomId, false);
      }
    }
  }

  /**
   * Send a response message
   */
  private async sendResponse(
    roomId: string,
    replyToEventId: string,
    response: string,
  ): Promise<string | void> {
    // Convert markdown to HTML
    const html = markdownToHtml(response);

    if (!this.client) {
      throw new Error("Matrix client not initialized");
    }

    let sentEventId: string;
    // Send as a reply if threading is enabled
    if (this.config.enableThreading) {
      sentEventId = await this.client.sendReply(
        roomId,
        replyToEventId,
        response,
        html,
      );
    } else {
      sentEventId = await this.client.sendFormattedMessage(
        roomId,
        response,
        html,
      );
    }

    return sentEventId;
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

    const html = markdownToHtml(response);

    if (!this.client) {
      throw new Error("Matrix client not initialized");
    }

    if (this.config.enableThreading) {
      await this.client.sendReply(roomId, replyToEventId, response, html);
    } else {
      await this.client.sendFormattedMessage(roomId, response, html, true);
    }
  }

  /**
   * Check if the message is addressed to this bot
   */
  private isAddressedToBot(event: {
    content?: {
      "m.mentions"?: {
        user_ids?: string[];
      };
    };
  }): boolean {
    const userIds = event.content?.["m.mentions"]?.user_ids;
    const isAddressed = userIds?.includes(this.config.userId) ?? false;

    this.logger.debug("Checking if bot is addressed", {
      botUserId: this.config.userId,
      mentionedUserIds: userIds,
      isAddressed,
    });

    return isAddressed;
  }

  /**
   * Check if the message is a command
   */
  private isCommand(message: string): boolean {
    return (
      message.startsWith(this.config.commandPrefix) ||
      message.startsWith(this.config.anchorPrefix)
    );
  }

  // Track progress messages for editing
  private progressMessages = new Map<string, string>();

  /**
   * Handle progress events - unified handler
   */
  protected async handleProgressEvent(
    progressEvent: JobProgressEvent,
    context: ProgressEventContext,
  ): Promise<void> {
    // Matrix only handles events from Matrix interface
    if (context.interfaceId !== "matrix") {
      return; // Event not from Matrix interface
    }

    // Use roomId from metadata instead of parsing target
    const roomId = context.roomId;
    if (!roomId) {
      return; // No routing information
    }

    // Handle job progress events
    if (progressEvent.type === "job") {
      await this.handleJobProgress(progressEvent, roomId);
    }
    // Handle batch progress events
    else if (progressEvent.type === "batch") {
      await this.handleBatchProgress(progressEvent, roomId);
    }
  }

  /**
   * Handle individual job progress updates
   */
  private async handleJobProgress(
    progressEvent: JobProgressEvent,
    roomId: string,
  ): Promise<void> {
    if (!this.client) return;

    // Only show completion message for individual jobs
    if (progressEvent.status === "completed") {
      const message = "✅ Task completed";
      try {
        await this.client.sendFormattedMessage(
          roomId,
          message,
          markdownToHtml(message),
        );
      } catch (error) {
        this.logger.error("Failed to send job completion message", {
          error,
          roomId,
        });
      }
    } else if (progressEvent.status === "failed") {
      const message = "❌ Task failed";
      try {
        await this.client.sendFormattedMessage(
          roomId,
          message,
          markdownToHtml(message),
        );
      } catch (error) {
        this.logger.error("Failed to send job failure message", {
          error,
          roomId,
        });
      }
    }
  }

  /**
   * Handle batch progress updates
   */
  private async handleBatchProgress(
    progressEvent: JobProgressEvent,
    roomId: string,
  ): Promise<void> {
    if (!this.client) return;

    const { batchDetails } = progressEvent;
    if (!batchDetails) return;

    let message: string;
    if (batchDetails.completedOperations >= batchDetails.totalOperations) {
      message = `✅ All ${batchDetails.totalOperations} tasks completed`;
    } else if (progressEvent.status === "failed") {
      message = `❌ Batch failed: ${batchDetails.completedOperations}/${batchDetails.totalOperations} tasks completed`;
    } else {
      message = `✅ ${batchDetails.completedOperations} of ${batchDetails.totalOperations} tasks completed`;
    }

    const progressKey = `batch:${progressEvent.id}:${roomId}`;
    const existingMessageId = this.progressMessages.get(progressKey);

    try {
      if (existingMessageId) {
        await this.client.editMessage(
          roomId,
          existingMessageId,
          message,
          markdownToHtml(message),
        );
      } else {
        const messageId = await this.client.sendFormattedMessage(
          roomId,
          message,
          markdownToHtml(message),
        );
        this.progressMessages.set(progressKey, messageId);
      }

      // Clean up when done
      if (
        progressEvent.status === "completed" ||
        progressEvent.status === "failed"
      ) {
        this.progressMessages.delete(progressKey);
      }
    } catch (error) {
      this.logger.error("Failed to send batch progress update", {
        error,
        roomId,
      });
    }
  }

  /**
   * Override getHelpText to format for Matrix (with markdown)
   */
  public override getHelpText(): string {
    const baseHelp = super.getHelpText();
    // Convert plain text formatting to Matrix markdown
    return baseHelp
      .replace("Available commands:", "**Available commands:**")
      .replace(/• \/(\w+)/g, "• `/$$1`"); // Wrap commands in backticks
  }
}
