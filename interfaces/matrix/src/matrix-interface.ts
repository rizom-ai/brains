import {
  MessageInterfacePlugin,
  type MessageInterfacePluginContext,
} from "@brains/message-interface-plugin";
import type { MessageContext } from "@brains/types";
import { type Daemon, type DaemonHealth } from "@brains/plugin-base";
import { PermissionHandler, markdownToHtml } from "@brains/utils";
import { matrixConfigSchema, MATRIX_CONFIG_DEFAULTS } from "./schemas";
import type { MatrixConfigInput, MatrixConfig } from "./schemas";
import { MatrixClientWrapper } from "./client/matrix-client";
import type { JobProgressEvent } from "@brains/job-queue";
import type { JobContext } from "@brains/db";
// MentionPill is for creating mentions, not detecting them
import packageJson from "../package.json";

/**
 * Matrix interface for Personal Brain
 * Provides chat-based interaction through Matrix protocol
 */
export class MatrixInterface extends MessageInterfacePlugin<MatrixConfig> {
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
   * Initialize Matrix interface on registration
   */
  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    // Create permission handler
    this.permissionHandler = new PermissionHandler(
      this.config.anchorUserId,
      this.config.trustedUsers,
    );

    // Create Matrix client
    this.client = new MatrixClientWrapper(this.config, this.logger);

    // Set up event handlers
    this.setupEventHandlers();

    this.logger.info("Matrix interface registered", {
      homeserver: this.config.homeserver,
      userId: this.config.userId,
    });
  }

  /**
   * Create daemon for managing Matrix client lifecycle
   */
  protected override createDaemon(): Daemon | undefined {
    return {
      start: async (): Promise<void> => {
        if (!this.client) {
          throw new Error("Matrix client not initialized");
        }
        this.logger.info("Starting Matrix interface...");
        await this.client.start();
        this.logger.info("Matrix interface started", {
          userId: this.config.userId,
          anchorUserId: this.config.anchorUserId,
          trustedUsers: this.config.trustedUsers?.length ?? 0,
        });
      },
      stop: async (): Promise<void> => {
        if (this.client) {
          this.logger.info("Stopping Matrix interface...");
          await this.client.stop();
          this.logger.info("Matrix interface stopped");
        }
      },
      healthCheck: async (): Promise<DaemonHealth> => {
        const isRunning = this.client?.isRunning() ?? false;
        return {
          status: isRunning ? "healthy" : "error",
          message: isRunning
            ? `Matrix client connected to ${this.config.homeserver}`
            : "Matrix client not running",
          lastCheck: new Date(),
          details: {
            homeserver: this.config.homeserver,
            userId: this.config.userId,
            running: isRunning,
          },
        };
      },
    };
  }

  /**
   * Handle user input with Matrix-specific routing logic
   */
  protected override async handleInput(
    input: string,
    context: MessageContext,
    replyToId?: string,
  ): Promise<void> {
    // Check for anchor-only commands (!!command)
    if (input.startsWith(this.config.anchorPrefix)) {
      if (context.userId !== this.config.anchorUserId) {
        throw new Error("This command is restricted to the anchor user");
      }
      // Process as command but remove extra prefix
      const command = input.slice(this.config.anchorPrefix.length - 1);
      const response = await this.executeCommand(command, context);

      // Send the message and get the message ID
      const messageId = await this.sendMessage(
        response.message,
        context,
        replyToId,
      );

      // Store job/batch message mapping if we have IDs
      if (response.jobId) {
        this.jobMessages.set(response.jobId, messageId);
        this.logger.info("Stored job message mapping", {
          jobId: response.jobId,
          messageId,
        });
      }
      if (response.batchId) {
        this.jobMessages.set(response.batchId, messageId);
        this.logger.info("Stored batch message mapping", {
          batchId: response.batchId,
          messageId,
        });
      }
      return;
    }

    // Use default routing (commands start with /, everything else is query)
    await super.handleInput(input, context, replyToId);
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

      // Process the message using the base class method with mapping
      await this.handleInput(message, messageContext, eventId);

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
   * Send a message and return the message ID
   */
  protected async sendMessage(
    content: string,
    context: MessageContext,
    replyToId?: string,
  ): Promise<string> {
    const html = markdownToHtml(content);

    if (!this.client) {
      throw new Error("Matrix client not initialized");
    }

    return this.config.enableThreading && replyToId
      ? this.client.sendReply(context.channelId, replyToId, content, html)
      : this.client.sendFormattedMessage(context.channelId, content, html);
  }

  /**
   * Edit an existing message - Matrix supports true message editing
   */
  protected override async editMessage(
    messageId: string,
    content: string,
    context: MessageContext,
  ): Promise<void> {
    if (!this.client) {
      throw new Error("Matrix client not initialized");
    }

    await this.client.editMessage(
      context.channelId,
      messageId,
      content,
      markdownToHtml(content),
    );
  }

  /**
   * Handle progress events - unified handler
   */
  protected async handleProgressEvent(
    progressEvent: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    // Matrix only handles events from Matrix interface
    if (context.interfaceId !== "matrix") {
      return; // Event not from Matrix interface
    }

    // Use channelId from metadata instead of parsing target
    const roomId = context.channelId;
    if (!roomId) {
      return; // No routing information
    }

    // Handle job progress events
    if (progressEvent.type === "job") {
      await this.handleJobProgress(progressEvent, roomId);
    } else {
      // Handle batch progress events
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

    // Create rich message with operation details
    let message: string;
    const operationDisplay = this.formatOperationDisplay(progressEvent);

    if (progressEvent.status === "completed") {
      message = `✅ **${operationDisplay}** completed`;

      // Add progress details if available
      if (progressEvent.progress) {
        const { current, total } = progressEvent.progress;
        if (total && total > 1) {
          message += ` (${current}/${total} items processed)`;
        }
      }
    } else if (progressEvent.status === "failed") {
      message = `❌ **${operationDisplay}** failed`;

      // Add error details if available
      if (progressEvent.message) {
        message += `\n> ${progressEvent.message}`;
      }
    } else if (
      progressEvent.status === "processing" &&
      progressEvent.progress
    ) {
      // Show processing status with details for long-running jobs
      const { current, total, percentage, etaFormatted, rateFormatted } =
        progressEvent.progress;

      message = `🔄 **${operationDisplay}** in progress`;

      if (total && total > 1) {
        message += `\n📊 Progress: ${current}/${total} (${percentage}%)`;

        if (etaFormatted) {
          message += `\n⏱️ ETA: ${etaFormatted}`;
        }

        if (rateFormatted) {
          message += `\n⚡ Rate: ${rateFormatted}`;
        }
      }

      if (progressEvent.metadata.operationTarget) {
        message += `\n📂 Target: \`${progressEvent.metadata.operationTarget}\``;
      }
    } else {
      // Don't send messages for other statuses (pending) to avoid spam
      return;
    }

    const existingMessageId = this.jobMessages.get(progressEvent.id);

    this.logger.info("Checking for existing job message", {
      jobId: progressEvent.id,
      existingMessageId,
      allMappings: Array.from(this.jobMessages.entries()),
    });

    try {
      if (existingMessageId) {
        // Edit the original command response message with progress
        await this.client.editMessage(
          roomId,
          existingMessageId,
          message,
          markdownToHtml(message),
        );
      } else {
        // No original message found, skip this update (race condition)
        this.logger.debug(
          "Skipping progress update due to missing message mapping",
          {
            jobId: progressEvent.id,
            status: progressEvent.status,
          },
        );
        return;
      }

      // Clean up when done
      if (
        progressEvent.status === "completed" ||
        progressEvent.status === "failed"
      ) {
        this.jobMessages.delete(progressEvent.id);
      }
    } catch (error) {
      this.logger.error("Failed to send job progress message", {
        error,
        roomId,
        status: progressEvent.status,
      });
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

    const operationDisplay = this.formatOperationDisplay(progressEvent);
    let message: string;

    if (batchDetails.completedOperations >= batchDetails.totalOperations) {
      message = `✅ **${operationDisplay}** batch completed`;
      message += `\n📊 **${batchDetails.totalOperations}** operations processed successfully`;

      if (batchDetails.failedOperations > 0) {
        message += `\n⚠️ ${batchDetails.failedOperations} operations failed`;
      }
    } else if (progressEvent.status === "failed") {
      message = `❌ **${operationDisplay}** batch failed`;
      message += `\n📊 Progress: ${batchDetails.completedOperations}/${batchDetails.totalOperations} completed`;

      if (batchDetails.failedOperations > 0) {
        message += `\n❌ ${batchDetails.failedOperations} operations failed`;
      }

      if (batchDetails.errors && batchDetails.errors.length > 0) {
        const latestError = batchDetails.errors[batchDetails.errors.length - 1];
        message += `\n> Latest error: ${latestError}`;
      }
    } else {
      // In progress
      message = `🔄 **${operationDisplay}** batch in progress`;
      message += `\n📊 Progress: ${batchDetails.completedOperations}/${batchDetails.totalOperations}`;

      // Add percentage if we have progress info
      if (progressEvent.progress?.percentage !== undefined) {
        message += ` (${progressEvent.progress.percentage}%)`;
      }

      if (progressEvent.progress?.etaFormatted) {
        message += `\n⏱️ ETA: ${progressEvent.progress.etaFormatted}`;
      }

      if (progressEvent.progress?.rateFormatted) {
        message += `\n⚡ Rate: ${progressEvent.progress.rateFormatted}`;
      }

      if (batchDetails.currentOperation) {
        message += `\n🔄 Current: ${batchDetails.currentOperation}`;
      }

      if (batchDetails.failedOperations > 0) {
        message += `\n⚠️ ${batchDetails.failedOperations} failed so far`;
      }
    }

    const existingMessageId = this.jobMessages.get(progressEvent.id);

    try {
      if (existingMessageId) {
        // Edit the original command response message with batch progress
        await this.client.editMessage(
          roomId,
          existingMessageId,
          message,
          markdownToHtml(message),
        );
      } else {
        // No original message found, skip this update (race condition)
        this.logger.debug(
          "Skipping batch progress update due to missing message mapping",
          {
            jobId: progressEvent.id,
            status: progressEvent.status,
          },
        );
        return;
      }

      // Clean up when done
      if (
        progressEvent.status === "completed" ||
        progressEvent.status === "failed"
      ) {
        this.jobMessages.delete(progressEvent.id);
      }
    } catch (error) {
      this.logger.error("Failed to send batch progress update", {
        error,
        roomId,
      });
    }
  }

  /**
   * Format operation display name
   */
  private formatOperationDisplay(progressEvent: JobProgressEvent): string {
    const { metadata } = progressEvent;
    const operationType = metadata.operationType;
    const operationTarget = metadata.operationTarget;

    // Convert snake_case to Title Case
    const displayName = operationType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    if (operationTarget) {
      return `${displayName}: ${operationTarget}`;
    }

    return displayName;
  }
}
