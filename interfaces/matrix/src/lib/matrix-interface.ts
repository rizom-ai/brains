import {
  MessageInterfacePlugin,
  type MessageInterfacePluginContext,
} from "@brains/plugins";
import {
  type Daemon,
  type DaemonHealth,
  type MessageContext,
  type JobProgressEvent,
  type JobContext,
} from "@brains/plugins";
import { matrixConfigSchema, MATRIX_CONFIG_DEFAULTS } from "../schemas";
import type { MatrixConfig } from "../schemas";
import { MatrixClientWrapper } from "../client/matrix-client";
import {
  handleRoomMessage as handleRoomMessageHandler,
  handleRoomInvite as handleRoomInviteHandler,
  type MatrixEventHandlerContext,
} from "../handlers/room-events";
import {
  sendMessage as sendMessageHandler,
  editMessage as editMessageHandler,
} from "../handlers/message";
import { handleProgressEvent as handleProgressEventHandler } from "../handlers/progress";
import packageJson from "../../package.json";

/**
 * Matrix interface for Personal Brain
 * Provides chat-based interaction through Matrix protocol
 */
export class MatrixInterface extends MessageInterfacePlugin<MatrixConfig> {
  // After validation with defaults, config is complete
  declare protected config: MatrixConfig;
  private client?: MatrixClientWrapper;

  constructor(config: Partial<MatrixConfig>, sessionId?: string) {
    super(
      "matrix",
      packageJson,
      config,
      matrixConfigSchema,
      MATRIX_CONFIG_DEFAULTS,
      sessionId,
    );
    // Set command prefix to match Matrix config
    this.commandPrefix = this.config.commandPrefix;
  }

  /**
   * Initialize Matrix interface on registration
   */
  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

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

  // No need to override handleInput - use the base class implementation

  /**
   * Set up Matrix event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) {
      return;
    }

    const handlerContext: MatrixEventHandlerContext = {
      client: this.client,
      config: this.config,
      logger: this.logger,
      handleInput: this.handleInput.bind(this),
      determineUserPermissionLevel:
        this.getContext().determineUserPermissionLevel,
    };

    // Handle room messages
    this.client.on("room.message", (...args: unknown[]) => {
      const [roomId, event] = args as [string, unknown];
      // Process the message asynchronously
      void handleRoomMessageHandler(roomId, event, handlerContext);
    });

    // Handle room invites (if auto-join is disabled)
    if (!this.config.autoJoinRooms) {
      this.client.on("room.invite", (...args: unknown[]) => {
        const [roomId, event] = args as [string, unknown];
        // Process the invite asynchronously
        void handleRoomInviteHandler(roomId, event, handlerContext);
      });
    }
  }

  /**
   * Send a message and return the message ID
   */
  protected async sendMessage(
    content: string,
    context: MessageContext,
    replyToId?: string,
  ): Promise<string> {
    return sendMessageHandler(
      content,
      context,
      this.client,
      this.config,
      replyToId,
    );
  }

  /**
   * Edit an existing message - Matrix supports true message editing
   */
  protected override async editMessage(
    messageId: string,
    content: string,
    context: MessageContext,
  ): Promise<void> {
    await editMessageHandler(messageId, content, context, this.client);
  }

  /**
   * Handle progress events - unified handler
   */
  protected async handleProgressEvent(
    progressEvent: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    await handleProgressEventHandler(
      progressEvent,
      context,
      this.client,
      this.jobMessages,
      this.logger,
    );
  }

  /**
   * Override shouldRespond to add Matrix-specific logic
   */
  protected override shouldRespond(
    message: string,
    context: MessageContext,
  ): boolean {
    // Check for regular commands
    if (message.startsWith(this.config.commandPrefix)) {
      return true;
    }

    // Check if bot is mentioned
    // We store whether the bot was mentioned in context metadata
    if (context.threadId === "mentioned") {
      return true;
    }

    // Check if it's a DM
    if (this.isDirectMessage(context.channelId)) {
      return true;
    }

    return false;
  }

  /**
   * Show thinking indicators (typing notification and reaction)
   */
  protected override async showThinkingIndicators(
    context: MessageContext,
  ): Promise<void> {
    const roomId = context.channelId;
    const eventId = context.messageId;

    if (!this.client) return;

    // Set typing indicator
    if (this.config.enableTypingNotifications) {
      try {
        await this.client.setTyping(roomId, true, 30000); // 30 second timeout
      } catch (error) {
        this.logger.debug("Failed to send typing indicator", { error });
      }
    }

    // Add thinking reaction
    if (this.config.enableReactions) {
      try {
        await this.client.sendReaction(roomId, eventId, "🤔");
      } catch (error) {
        this.logger.debug("Failed to send thinking reaction", { error });
      }
    }
  }

  /**
   * Show done indicators (stop typing and done reaction)
   */
  protected override async showDoneIndicators(
    context: MessageContext,
  ): Promise<void> {
    const roomId = context.channelId;
    const eventId = context.messageId;

    if (!this.client) return;

    // Stop typing indicator
    if (this.config.enableTypingNotifications) {
      try {
        await this.client.setTyping(roomId, false);
      } catch (error) {
        this.logger.debug("Failed to stop typing indicator", { error });
      }
    }

    // Add done reaction
    if (this.config.enableReactions) {
      try {
        await this.client.sendReaction(roomId, eventId, "✅");
      } catch (error) {
        this.logger.debug("Failed to send done reaction", { error });
      }
    }
  }
}
