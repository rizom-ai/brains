import type { DefaultQueryResponse } from "@brains/types";
import type { IMessageInterfacePlugin, MessageContext } from "./interfaces";
import type { z } from "zod";
import { InterfacePlugin } from "./interface-plugin";
import { EventEmitter } from "node:events";
import PQueue from "p-queue";

/**
 * Base implementation of MessageInterfacePlugin
 * Provides message processing functionality with event emitter capabilities
 */
export abstract class MessageInterfacePlugin<TConfig = unknown>
  extends InterfacePlugin<TConfig>
  implements IMessageInterfacePlugin
{
  protected queue: PQueue;
  public readonly sessionId: string;
  private eventEmitter: EventEmitter;

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
    this.eventEmitter = new EventEmitter();
  }

  // EventEmitter delegation
  public on(event: string, listener: (...args: unknown[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  public off(event: string, listener: (...args: unknown[]) => void): this {
    this.eventEmitter.off(event, listener);
    return this;
  }

  public emit(event: string, ...args: unknown[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  /**
   * Process user input with default context handling
   */
  public async processInput(
    input: string,
    context?: Partial<MessageContext>,
  ): Promise<void> {
    const userId = context?.userId ?? "default-user";
    const userPermissionLevel = this.determineUserPermissionLevel(userId);

    const fullContext: MessageContext = {
      userId,
      channelId: context?.channelId ?? this.sessionId,
      messageId: context?.messageId ?? `msg-${Date.now()}`,
      timestamp: context?.timestamp ?? new Date(),
      interfaceType: this.id,
      userPermissionLevel,
      ...context,
    };

    try {
      const response = await this.handleInput(input, fullContext);
      this.emit("response", response);
    } catch (error) {
      this.logger.error("Failed to process input", { error });
      this.emit("error", error);
    }
  }

  /**
   * Handle user input - routes to appropriate method based on input type
   * Can be overridden by subclasses for custom routing logic
   */
  protected async handleInput(
    input: string,
    context: MessageContext,
  ): Promise<string> {
    // Default routing logic: commands start with '/', everything else is a query
    if (input.startsWith("/")) {
      return this.executeCommand(input, context);
    }

    return this.processQuery(input, context);
  }

  /**
   * Store context messages for conversation history (no response needed)
   * Override this to customize context storage behavior
   */
  public async addContext(
    message: string,
    context: MessageContext,
  ): Promise<void> {
    // Default: Store in conversation history for future reference
    // For now, we just log it - could be enhanced to store in database
    this.logger.debug("Adding context message", {
      userId: context.userId,
      channelId: context.channelId,
      message: message.substring(0, 100),
    });
  }

  /**
   * Process queries through the shell and return response
   * Override this to customize query processing
   */
  public async processQuery(
    query: string,
    context: MessageContext,
  ): Promise<string> {
    if (!this.context) {
      throw new Error("Plugin context not initialized");
    }

    const result = await this.queue.add(async () => {
      // Use Shell's knowledge-query template to process the query and get response
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

      // Return the already-formatted response from the template system
      return queryResponse.message;
    });

    if (!result) {
      throw new Error("No response from query processor");
    }

    return result;
  }

  /**
   * Execute interface-specific commands
   * Override this to add interface-specific commands like /help, /quit, etc.
   */
  public async executeCommand(
    command: string,
    _context: MessageContext,
  ): Promise<string> {
    // Default: Return unknown command (interfaces should override this)
    return `Unknown command: ${command}. Type /help for available commands.`;
  }
}
