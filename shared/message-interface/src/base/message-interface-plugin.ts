import type { DefaultQueryResponse } from "@brains/types";
import type { PluginContext } from "@brains/plugin-utils";
import { InterfacePlugin } from "@brains/plugin-utils";
import type { JobProgressEvent } from "@brains/job-queue";
import type { ProgressEventContext } from "@brains/db";
import type { z } from "zod";
import PQueue from "p-queue";

import type { Command, MessageContext, IMessageInterfacePlugin } from "./types";
import { commandResponseSchema } from "./types";
import { getBaseCommands } from "../commands/base-commands";
import {
  getTestCommands,
  registerTestJobHandlers,
} from "../commands/test-commands";
import { setupProgressHandler } from "../utils/progress-handler";

/**
 * Base implementation of MessageInterfacePlugin
 * Provides message processing functionality for interface plugins
 */
export abstract class MessageInterfacePlugin<TConfig = unknown>
  extends InterfacePlugin<TConfig>
  implements IMessageInterfacePlugin
{
  protected queue: PQueue;
  public readonly sessionId: string;

  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    partialConfig: Partial<TConfig>,
    configSchema: z.ZodType<TConfig>,
    defaults: Partial<TConfig>,
    sessionId?: string,
  ) {
    super(id, packageJson, partialConfig, configSchema, defaults);
    this.sessionId = sessionId ?? `${id}-session-${Date.now()}`;
    this.queue = new PQueue({
      concurrency: 1,
      interval: 1000,
      intervalCap: 10,
    });
  }

  /**
   * Handle progress events - must be implemented by each interface
   */
  protected abstract handleProgressEvent(
    progressEvent: JobProgressEvent,
    context: ProgressEventContext,
  ): Promise<void>;

  /**
   * Get commands available to this interface
   * Override to add interface-specific commands
   */
  protected getCommands(): Command[] {
    return [
      ...getBaseCommands(this),
      ...getTestCommands(this.id, this.context),
    ];
  }

  /**
   * Register handlers and subscriptions
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    await super.onRegister(context);

    // Setup progress event handling with callbacks
    setupProgressHandler(context, {
      onProgress: async (event, eventContext) => {
        await this.handleProgressEvent(event, eventContext);
      },
      onError: (error) => {
        this.logger.error("Error handling progress event", {
          error,
          interfaceId: this.id,
        });
      },
      onInvalidSchema: () => {
        this.logger.warn("Invalid progress event schema", {
          interfaceId: this.id,
        });
      },
    });

    // Register test job handlers
    registerTestJobHandlers(context);

    this.logger.debug("Message interface registered", { id: this.id });
  }

  /**
   * Process user input with default context handling
   */
  public async processInput(
    input: string,
    context?: Partial<MessageContext>,
  ): Promise<void> {
    const fullContext = this.buildContext(input, context);

    try {
      await this.handleInput(input, fullContext);
    } catch (error) {
      this.logger.error("Failed to process input", { error });
      throw error;
    }
  }

  /**
   * Build full message context from partial input
   */
  protected buildContext(
    _input: string,
    context?: Partial<MessageContext>,
  ): MessageContext {
    const userId = context?.userId ?? "default-user";
    const userPermissionLevel = this.determineUserPermissionLevel(userId);

    return {
      userId,
      channelId: context?.channelId ?? this.sessionId,
      messageId: context?.messageId ?? `msg-${Date.now()}`,
      timestamp: context?.timestamp ?? new Date(),
      interfaceType: this.id,
      userPermissionLevel,
      ...context,
    };
  }

  /**
   * Route input to appropriate handler
   */
  protected async handleInput(
    input: string,
    context: MessageContext,
  ): Promise<string> {
    if (input.startsWith("/")) {
      return this.executeCommand(input, context);
    }
    return this.processQuery(input, context);
  }

  /**
   * Process queries through the shell
   */
  public async processQuery(
    query: string,
    context: MessageContext,
  ): Promise<string> {
    if (!this.context) {
      throw new Error("Plugin context not initialized");
    }

    const result = await this.queue.add(async () => {
      if (!this.context) {
        throw new Error("Plugin context not initialized");
      }

      const queryResponse =
        await this.context.generateContent<DefaultQueryResponse>({
          prompt: query,
          templateName: "shell:knowledge-query",
          userId: context.userId,
          data: {
            userId: context.userId,
            conversationId: context.channelId,
            messageId: context.messageId,
            threadId: context.threadId,
            timestamp: context.timestamp.toISOString(),
          },
        });

      return queryResponse.message;
    });

    if (!result) {
      throw new Error("No response from query processor");
    }

    return result;
  }

  /**
   * Execute commands
   */
  public async executeCommand(
    command: string,
    context: MessageContext,
  ): Promise<string> {
    const [cmd, ...args] = command.slice(1).split(" ");
    const commands = this.getCommands();
    const commandDef = commands.find((c) => c.name === cmd);

    if (commandDef) {
      const response = await commandDef.handler(args, context);
      const parsed = commandResponseSchema.parse(response);

      if (typeof parsed === "string") {
        return parsed;
      }

      return parsed.message;
    }

    return `Unknown command: ${command}. Type /help for available commands.`;
  }

  /**
   * Add context message for conversation history
   */
  public async addContext(
    message: string,
    context: MessageContext,
  ): Promise<void> {
    this.logger.debug("Adding context message", {
      userId: context.userId,
      channelId: context.channelId,
      message: message.substring(0, 100),
    });
  }

  /**
   * Get help text
   */
  public getHelpText(): string {
    const commands = this.getCommands();
    const commandList = commands
      .map((cmd) => {
        const usage = cmd.usage ?? `/${cmd.name}`;
        return `• ${usage} - ${cmd.description}`;
      })
      .join("\n");

    return `Available commands:
${commandList}

Type any message to interact with the brain.`;
  }
}
