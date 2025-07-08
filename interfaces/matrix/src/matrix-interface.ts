import {
  MessageInterfacePlugin,
  type MessageContext,
} from "@brains/plugin-utils";
import { PermissionHandler, markdownToHtml } from "@brains/utils";
import { matrixConfigSchema, MATRIX_CONFIG_DEFAULTS } from "./schemas";
import type { MatrixConfigInput, MatrixConfig } from "./schemas";
import { MatrixClientWrapper } from "./client/matrix-client";
import { JobProgressEventSchema } from "@brains/job-queue";
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
  // Track batch operation messages for progress updates
  private batchProgressMessages = new Map<
    string,
    { roomId: string; eventId: string }
  >();

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
    const result = await super.handleInput(input, context);

    // Check if the result contains a batch operation
    try {
      const parsed = JSON.parse(result);
      if (parsed.batchId && parsed.status === "queued" && context.messageId) {
        // Track this message for progress updates
        this.batchProgressMessages.set(parsed.batchId, {
          roomId: context.channelId,
          eventId: context.messageId,
        });

        // Subscribe to progress updates for this batch
        this.subscribeToProgressUpdates(parsed.batchId);
      }
    } catch {
      // Not JSON or doesn't contain batch info, ignore
    }

    return result;
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
      await this.sendResponse(roomId, eventId, response);

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

    // Check if the response contains batch info and track it
    try {
      const parsed = JSON.parse(response);
      if (parsed.batchId && parsed.status === "queued") {
        // First, update the message to show the user-friendly text
        if (parsed.message) {
          await this.client.editMessage(
            roomId,
            sentEventId,
            parsed.message,
            markdownToHtml(parsed.message),
          );
        }

        // Then track for updates
        this.batchProgressMessages.set(parsed.batchId, {
          roomId,
          eventId: sentEventId,
        });
        this.subscribeToProgressUpdates(parsed.batchId);
      }
    } catch {
      // Not JSON, ignore
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

  /**
   * Override getHelpText to format for Matrix (with markdown)
   */
  protected override getHelpText(): string {
    const baseHelp = super.getHelpText();
    // Convert plain text formatting to Matrix markdown
    return baseHelp
      .replace("Available commands:", "**Available commands:**")
      .replace(/• \/(\w+)/g, "• `/$$1`"); // Wrap commands in backticks
  }

  /**
   * Subscribe to progress updates for a batch operation
   */
  private subscribeToProgressUpdates(batchId: string): void {
    if (!this.context) {
      this.logger.warn("Cannot subscribe to progress updates - no context");
      return;
    }

    // Subscribe to job progress updates (includes batch progress)
    const unsubscribe = this.context.subscribe(
      "job-progress",
      async (message) => {
        // Validate the event payload
        const validationResult = JobProgressEventSchema.safeParse(
          message.payload,
        );
        if (!validationResult.success) {
          this.logger.warn("Invalid job progress event", {
            error: validationResult.error,
            payload: message.payload,
          });
          return { success: true };
        }

        const progressEvent = validationResult.data;

        // Only handle batch progress events for this batch
        if (progressEvent.type !== "batch" || progressEvent.id !== batchId) {
          return { success: true };
        }

        // Get the message to update
        const messageInfo = this.batchProgressMessages.get(batchId);
        if (!messageInfo || !this.client) {
          return { success: true };
        }

        // Extract batch details
        const batchDetails = progressEvent.batchDetails;
        if (!batchDetails) {
          this.logger.warn("Batch progress event missing batchDetails", {
            event: progressEvent,
          });
          return { success: true };
        }

        // Format progress message
        let progressText = "";

        if (progressEvent.progress) {
          progressText = `**Progress:** ${batchDetails.completedOperations}/${batchDetails.totalOperations} operations (${progressEvent.progress.percentage}%)\n`;
        } else {
          const progressPercent = Math.round(
            (batchDetails.completedOperations / batchDetails.totalOperations) *
              100,
          );
          progressText = `**Progress:** ${batchDetails.completedOperations}/${batchDetails.totalOperations} operations (${progressPercent}%)\n`;
        }

        if (batchDetails.currentOperation) {
          progressText += `**Current:** ${batchDetails.currentOperation}\n`;
        }

        if (batchDetails.failedOperations > 0) {
          progressText += `**Failed:** ${batchDetails.failedOperations} operations\n`;
        }

        // Update the message based on status
        if (progressEvent.status === "completed") {
          progressText = `✅ **Batch operation completed**\n`;
          progressText += `**Total:** ${batchDetails.totalOperations} operations\n`;
          progressText += `**Completed:** ${batchDetails.completedOperations}\n`;
          if (batchDetails.failedOperations > 0) {
            progressText += `**Failed:** ${batchDetails.failedOperations}\n`;
          }

          // Clean up
          this.batchProgressMessages.delete(batchId);
          unsubscribe();
        } else if (progressEvent.status === "failed") {
          progressText = `❌ **Batch operation failed**\n`;
          progressText += `**Completed:** ${batchDetails.completedOperations}/${batchDetails.totalOperations}\n`;
          if (batchDetails.failedOperations > 0) {
            progressText += `**Failed:** ${batchDetails.failedOperations}\n`;
          }

          // Clean up
          this.batchProgressMessages.delete(batchId);
          unsubscribe();
        }

        // Convert to HTML and edit the message
        const html = markdownToHtml(progressText);
        try {
          await this.client.editMessage(
            messageInfo.roomId,
            messageInfo.eventId,
            progressText,
            html,
          );
        } catch (error) {
          this.logger.error("Failed to edit progress message", {
            batchId,
            error,
          });
        }

        return { success: true };
      },
    );
  }
}
