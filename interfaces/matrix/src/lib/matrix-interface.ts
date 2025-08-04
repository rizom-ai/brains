import {
  MessageInterfacePlugin,
  type MessageInterfacePluginContext,
} from "@brains/plugins";
import type { MessageContext } from "@brains/messaging-service";
import { type Daemon, type DaemonHealth } from "@brains/plugins";
import { PermissionHandler } from "@brains/utils";
import { matrixConfigSchema, MATRIX_CONFIG_DEFAULTS } from "../schemas";
import type { MatrixConfigInput, MatrixConfig } from "../schemas";
import { MatrixClientWrapper } from "../client/matrix-client";
import type { JobProgressEvent } from "@brains/job-queue";
import type { JobContext } from "@brains/db";
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
    if (!this.client || !this.permissionHandler) {
      return;
    }

    const handlerContext: MatrixEventHandlerContext = {
      client: this.client,
      config: this.config,
      logger: this.logger,
      permissionHandler: this.permissionHandler,
      handleInput: this.handleInput.bind(this),
      determineUserPermissionLevel:
        this.determineUserPermissionLevel.bind(this),
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
}
