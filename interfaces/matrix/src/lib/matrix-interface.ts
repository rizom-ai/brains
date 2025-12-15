import {
  MessageInterfacePlugin,
  type InterfacePluginContext,
} from "@brains/plugins";
import type { Daemon, DaemonHealth } from "@brains/daemon-registry";
import type { IAgentService } from "@brains/agent-service";
import { markdownToHtml } from "@brains/utils";
import { matrixConfigSchema } from "../schemas";
import type { MatrixConfig } from "../schemas";
import { MatrixClientWrapper } from "../client/matrix-client";
import packageJson from "../../package.json";

/**
 * Matrix Interface - Agent-based architecture
 *
 * This interface:
 * - Routes ALL messages to AgentService (no command parsing)
 * - Uses AI agent for natural language interaction
 * - Handles confirmation flow for destructive operations
 * - Extends MessageInterfacePlugin for progress event handling
 */
export class MatrixInterface extends MessageInterfacePlugin<MatrixConfig> {
  declare protected config: MatrixConfig;
  private client?: MatrixClientWrapper;
  private agentService?: IAgentService;

  // Track pending confirmations per conversation
  private pendingConfirmations = new Map<string, boolean>();

  constructor(config: Partial<MatrixConfig>) {
    super("matrix", packageJson, config, matrixConfigSchema);
  }

  /**
   * Get AgentService, throwing if not initialized
   */
  private getAgentService(): IAgentService {
    if (!this.agentService) {
      throw new Error("AgentService not initialized - plugin not registered");
    }
    return this.agentService;
  }

  /**
   * Initialize Matrix interface on registration
   */
  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    // Get AgentService from context
    this.agentService = context.agentService;

    // Create Matrix client
    this.client = new MatrixClientWrapper(this.config, this.logger);

    // Set up event handlers
    this.setupEventHandlers(context);

    this.logger.debug("Matrix interface registered", {
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
        this.logger.debug("Starting Matrix interface...");
        await this.client.start();
        this.logger.debug("Matrix interface started", {
          userId: this.config.userId,
        });
      },
      stop: async (): Promise<void> => {
        if (this.client) {
          this.logger.debug("Stopping Matrix interface...");
          await this.client.stop();
          this.logger.debug("Matrix interface stopped");
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
   * Set up Matrix event handlers
   */
  private setupEventHandlers(context: InterfacePluginContext): void {
    if (!this.client) {
      return;
    }

    // Handle room messages
    this.client.on("room.message", (...args: unknown[]) => {
      const [roomId, event] = args as [string, unknown];
      void this.handleRoomMessage(roomId, event, context);
    });

    // Handle room invites (if auto-join is disabled)
    if (!this.config.autoJoinRooms) {
      this.client.on("room.invite", (...args: unknown[]) => {
        const [roomId, event] = args as [string, unknown];
        void this.handleRoomInvite(roomId, event, context);
      });
    }
  }

  /**
   * Handle incoming room messages - route to AgentService
   */
  private async handleRoomMessage(
    roomId: string,
    event: unknown,
    context: InterfacePluginContext,
  ): Promise<void> {
    const messageEvent = event as {
      sender?: string;
      content?: {
        msgtype?: string;
        body?: string;
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

    // Extract message details
    const senderId = messageEvent.sender ?? "unknown";
    const eventId = messageEvent.event_id ?? "unknown";
    const msgtype = messageEvent.content?.msgtype;
    const message = messageEvent.content?.body;

    // Only process text messages
    if (msgtype !== "m.text" || !message) {
      return;
    }

    // Check if bot is mentioned or if it's a DM
    const isMentioned = this.isAddressedToBot(messageEvent);
    const isDM = this.isDirectMessage(roomId);

    // Only respond if mentioned or in DM
    if (!isMentioned && !isDM) {
      return;
    }

    // Build conversation ID
    const conversationId = `matrix-${roomId}`;

    // Look up user's permission level
    const userPermissionLevel = context.getUserPermissionLevel(
      "matrix",
      senderId,
    );

    this.logger.debug("Processing message", {
      roomId,
      senderId,
      conversationId,
      isMentioned,
      userPermissionLevel,
    });

    // Start processing - buffers completion messages until agent responds
    this.startProcessingInput(roomId);

    try {
      // Show typing indicator
      await this.showTypingIndicator(roomId);

      // Check for confirmation response
      if (this.pendingConfirmations.has(conversationId)) {
        await this.handleConfirmationResponse(message, conversationId, roomId);
        return;
      }

      // Route message to AgentService with user's permission level
      const response = await this.getAgentService().chat(
        message,
        conversationId,
        {
          userPermissionLevel,
          interfaceType: "matrix",
          channelId: roomId,
        },
      );

      // Track pending confirmation if returned
      if (response.pendingConfirmation) {
        this.pendingConfirmations.set(conversationId, true);
      }

      // Build response with tool results
      const responseText = response.text;

      // Debug: Log tool results
      this.logger.debug("Agent response received", {
        hasToolResults: !!response.toolResults,
        toolResultsCount: response.toolResults?.length ?? 0,
        toolNames: response.toolResults?.map((r) => r.toolName) ?? [],
      });

      // Tool formatted outputs are kept in response.toolResults for logging/evals
      // but not auto-appended to user-visible text - agent should summarize
      if (response.toolResults && response.toolResults.length > 0) {
        this.logger.debug("Tool results available", {
          count: response.toolResults.length,
          tools: response.toolResults.map((r) => r.toolName),
        });
      }

      // Send response to room and track for job completion updates
      const messageId = await this.sendMessageWithId(roomId, responseText);

      // Track the message for any async jobs so we can edit it on completion
      if (messageId && response.toolResults) {
        for (const toolResult of response.toolResults) {
          if (toolResult.jobId) {
            this.trackAgentResponseForJob(toolResult.jobId, messageId, roomId);
          }
        }
      }
    } catch (error) {
      this.logger.error("Error handling message", { error, roomId, eventId });
      await this.sendErrorResponse(roomId, error, eventId);
    } finally {
      // End processing - flushes any buffered completion messages
      this.endProcessingInput();
      // Stop typing indicator
      await this.stopTypingIndicator(roomId);
    }
  }

  /**
   * Handle confirmation responses (yes/no)
   */
  private async handleConfirmationResponse(
    message: string,
    conversationId: string,
    roomId: string,
  ): Promise<void> {
    const normalizedMessage = message.toLowerCase().trim();
    const isConfirmed =
      normalizedMessage === "yes" ||
      normalizedMessage === "y" ||
      normalizedMessage === "confirm";

    // Clear pending confirmation
    this.pendingConfirmations.delete(conversationId);

    // Call AgentService to confirm or cancel
    const response = await this.getAgentService().confirmPendingAction(
      conversationId,
      isConfirmed,
    );

    // Send response
    this.sendMessageToChannel(roomId, response.text);
  }

  /**
   * Handle room invites
   */
  private async handleRoomInvite(
    roomId: string,
    event: unknown,
    context: InterfacePluginContext,
  ): Promise<void> {
    const inviteEvent = event as {
      sender?: string;
    };

    const inviter = inviteEvent.sender ?? "unknown";

    // Check permissions using centralized permission service
    const userPermissionLevel = context.getUserPermissionLevel(
      "matrix",
      inviter,
    );

    // Only accept invites from anchor users
    if (userPermissionLevel !== "anchor") {
      this.logger.debug("Ignoring room invite from non-anchor user", {
        roomId,
        inviter,
        permissionLevel: userPermissionLevel,
      });
      return;
    }

    try {
      await this.client?.joinRoom(roomId);
      this.logger.debug("Joined room after invite from anchor user", {
        roomId,
        inviter,
      });
    } catch (error) {
      this.logger.error("Failed to join room", {
        error,
        roomId,
        inviter,
      });
    }
  }

  /**
   * Check if message is addressed to the bot
   */
  private isAddressedToBot(event: {
    content?: {
      "m.mentions"?: {
        user_ids?: string[];
      };
    };
  }): boolean {
    const userIds = event.content?.["m.mentions"]?.user_ids;
    return userIds?.includes(this.config.userId) ?? false;
  }

  /**
   * Check if room is a direct message
   * TODO: Implement proper DM detection using room state
   */
  private isDirectMessage(_roomId: string): boolean {
    // For now, we don't have DM tracking - rely on mentions
    return false;
  }

  /**
   * Send message to channel - implements abstract method from MessageInterfacePlugin
   * Used for agent responses and progress event notifications
   */
  protected override sendMessageToChannel(
    channelId: string | null,
    message: string,
  ): void {
    if (!this.client) {
      this.logger.debug("Cannot send message - client not initialized");
      return;
    }

    // Use provided channelId or fall back to current channel from base class
    const roomId = channelId ?? this.getCurrentChannelId();
    if (!roomId) {
      this.logger.debug("Cannot send message - no room context");
      return;
    }

    // Send asynchronously - don't block progress event handling
    const html = markdownToHtml(message);
    this.client
      .sendFormattedMessage(roomId, message, html, true)
      .catch((error) => {
        this.logger.error("Failed to send message", { error, roomId });
      });
  }

  /**
   * Send message and return its ID for progress tracking
   */
  protected override async sendMessageWithId(
    channelId: string | null,
    message: string,
  ): Promise<string | undefined> {
    if (!this.client) {
      return undefined;
    }

    const roomId = channelId ?? this.getCurrentChannelId();
    if (!roomId) {
      return undefined;
    }

    try {
      const html = markdownToHtml(message);
      const eventId = await this.client.sendFormattedMessage(
        roomId,
        message,
        html,
        true,
      );
      return eventId;
    } catch (error) {
      this.logger.error("Failed to send message with ID", { error, roomId });
      return undefined;
    }
  }

  /**
   * Edit a previously sent message (for progress updates)
   */
  protected override async editMessage(
    channelId: string,
    messageId: string,
    newMessage: string,
  ): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const html = markdownToHtml(newMessage);
      await this.client.editMessage(channelId, messageId, newMessage, html);
      return true;
    } catch (error) {
      this.logger.error("Failed to edit message", {
        error,
        channelId,
        messageId,
      });
      return false;
    }
  }

  /**
   * Matrix supports message editing for progress updates
   */
  protected override supportsMessageEditing(): boolean {
    return true;
  }

  /**
   * Send error response to Matrix room
   */
  private async sendErrorResponse(
    roomId: string,
    error: unknown,
    _replyToEventId?: string,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    const response = `**Error:** ${errorMessage}`;
    this.sendMessageToChannel(roomId, response);
  }

  /**
   * Show typing indicator
   */
  private async showTypingIndicator(roomId: string): Promise<void> {
    if (!this.client || !this.config.enableTypingNotifications) {
      return;
    }

    try {
      await this.client.setTyping(roomId, true, 30000);
    } catch (error) {
      this.logger.debug("Failed to send typing indicator", { error });
    }
  }

  /**
   * Stop typing indicator
   */
  private async stopTypingIndicator(roomId: string): Promise<void> {
    if (!this.client || !this.config.enableTypingNotifications) {
      return;
    }

    try {
      await this.client.setTyping(roomId, false);
    } catch (error) {
      this.logger.debug("Failed to stop typing indicator", { error });
    }
  }
}
