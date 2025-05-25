import type { Logger } from "@brains/utils";
import type { MessageBus } from "../messaging/messageBus";
import type { QueryProcessor } from "../query/queryProcessor";
import { MessageFactory } from "../messaging/messageFactory";
import type { BaseMessage, MessageResponse } from "../messaging/types";
import { hasPayload } from "../messaging/types";
import { z } from "zod";
import { defaultQueryResponseSchema } from "../schemas/defaults";

/**
 * Command schema for Brain Protocol commands
 */
export const commandSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  args: z.record(z.unknown()).optional(),
  context: z
    .object({
      userId: z.string().optional(),
      conversationId: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .optional(),
});

export type Command = z.infer<typeof commandSchema>;

/**
 * Command response schema
 */
export const commandResponseSchema = z.object({
  id: z.string().min(1),
  commandId: z.string().min(1),
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export type CommandResponse = z.infer<typeof commandResponseSchema>;

/**
 * Brain Protocol - handles command routing and message processing
 * Implements Component Interface Standardization pattern
 */
export class BrainProtocol {
  private static instance: BrainProtocol | null = null;

  private readonly logger: Logger;
  private readonly messageBus: MessageBus;
  private readonly queryProcessor: QueryProcessor;
  private commandHandlers = new Map<
    string,
    (cmd: Command) => Promise<CommandResponse>
  >();

  /**
   * Get the singleton instance of BrainProtocol
   */
  public static getInstance(
    logger: Logger,
    messageBus: MessageBus,
    queryProcessor: QueryProcessor,
  ): BrainProtocol {
    if (!BrainProtocol.instance) {
      BrainProtocol.instance = new BrainProtocol(
        logger,
        messageBus,
        queryProcessor,
      );
    }
    return BrainProtocol.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    BrainProtocol.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    logger: Logger,
    messageBus: MessageBus,
    queryProcessor: QueryProcessor,
  ): BrainProtocol {
    return new BrainProtocol(logger, messageBus, queryProcessor);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    logger: Logger,
    messageBus: MessageBus,
    queryProcessor: QueryProcessor,
  ) {
    this.logger = logger;
    this.messageBus = messageBus;
    this.queryProcessor = queryProcessor;

    // Register default command handlers
    this.registerDefaultHandlers();

    // Set up message bus handlers
    this.setupMessageHandlers();
  }

  /**
   * Register default command handlers
   */
  private registerDefaultHandlers(): void {
    // Query command
    this.registerCommandHandler("query", async (cmd) => {
      try {
        const query = String(cmd.args?.["query"] ?? "");
        const options: Parameters<typeof this.queryProcessor.processQuery>[1] =
          {
            schema: defaultQueryResponseSchema,
          };
        if (cmd.context?.userId) options.userId = cmd.context.userId;
        if (cmd.context?.conversationId)
          options.conversationId = cmd.context.conversationId;
        if (cmd.context?.metadata) options.metadata = cmd.context.metadata;

        const result = await this.queryProcessor.processQuery(query, options);

        return {
          id: MessageFactory.createMessage("command.response").id,
          commandId: cmd.id,
          success: true,
          result,
        };
      } catch (error) {
        return {
          id: MessageFactory.createMessage("command.response").id,
          commandId: cmd.id,
          success: false,
          error: {
            code: "QUERY_ERROR",
            message: error instanceof Error ? error.message : "Query failed",
          },
        };
      }
    });

    // Help command
    this.registerCommandHandler("help", async (cmd) => {
      const commands = Array.from(this.commandHandlers.keys());
      return {
        id: MessageFactory.createMessage("command.response").id,
        commandId: cmd.id,
        success: true,
        result: {
          availableCommands: commands,
          usage:
            "Send a command with the format: { command: 'commandName', args: { ... } }",
        },
      };
    });
  }

  /**
   * Set up message bus handlers
   */
  private setupMessageHandlers(): void {
    // Handle command messages - validate internally
    this.messageBus.registerHandler(
      "command.execute",
      async (message: BaseMessage) => {
        try {
          // Use type guard to validate message has payload
          if (!hasPayload(message)) {
            throw new Error("Command message must have a payload");
          }

          const command = commandSchema.parse(message.payload);
          const response = await this.executeCommand(command);

          return MessageFactory.createSuccessResponse(message.id, response);
        } catch (error) {
          this.logger.error("Command execution failed", error);
          return MessageFactory.createErrorResponse(
            message.id,
            "COMMAND_ERROR",
            error instanceof Error ? error.message : "Command execution failed",
          );
        }
      },
    );
  }

  /**
   * Register a command handler
   */
  public registerCommandHandler(
    command: string,
    handler: (cmd: Command) => Promise<CommandResponse>,
  ): void {
    if (this.commandHandlers.has(command)) {
      this.logger.warn(`Overwriting existing handler for command: ${command}`);
    }

    this.commandHandlers.set(command, handler);
    this.logger.info(`Registered command handler: ${command}`);
  }

  /**
   * Execute a command
   */
  public async executeCommand(command: Command): Promise<CommandResponse> {
    this.logger.debug(`Executing command: ${command.command}`);

    const handler = this.commandHandlers.get(command.command);
    if (!handler) {
      return {
        id: MessageFactory.createMessage("command.response").id,
        commandId: command.id,
        success: false,
        error: {
          code: "COMMAND_NOT_FOUND",
          message: `Unknown command: ${command.command}`,
        },
      };
    }

    try {
      return await handler(command);
    } catch (error) {
      this.logger.error(`Command handler error for ${command.command}`, error);
      return {
        id: MessageFactory.createMessage("command.response").id,
        commandId: command.id,
        success: false,
        error: {
          code: "HANDLER_ERROR",
          message:
            error instanceof Error ? error.message : "Command handler failed",
        },
      };
    }
  }

  /**
   * Process a raw message (for MCP integration)
   */
  public async processMessage(message: unknown): Promise<MessageResponse> {
    try {
      // Try to parse as command
      const command = commandSchema.parse(message);
      const response = await this.executeCommand(command);

      return MessageFactory.createSuccessResponse(command.id, response);
    } catch (error) {
      // If not a valid command, try to route through message bus
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message
      ) {
        const busResponse = await this.messageBus.publish(
          message as BaseMessage,
        );
        if (busResponse) {
          return busResponse;
        }
      }

      // Unable to process
      return MessageFactory.createErrorResponse(
        "unknown",
        "INVALID_MESSAGE",
        "Unable to process message",
      );
    }
  }

  /**
   * Get registered commands
   */
  public getRegisteredCommands(): string[] {
    return Array.from(this.commandHandlers.keys());
  }
}
