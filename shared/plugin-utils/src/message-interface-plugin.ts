import type {
  DefaultQueryResponse,
  MessageInterfacePlugin as IMessageInterfacePlugin,
  MessageContext,
} from "@brains/types";
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
    config: TConfig,
    configSchema?: z.ZodType<TConfig>,
    sessionId?: string,
  ) {
    super(id, packageJson, config, configSchema);
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
    const fullContext: MessageContext = {
      userId: context?.userId ?? "default-user",
      channelId: context?.channelId ?? this.sessionId,
      messageId: context?.messageId ?? `msg-${Date.now()}`,
      timestamp: context?.timestamp ?? new Date(),
      interfaceType: this.id,
      ...context,
    };

    try {
      const response = await this.handleInput(input, fullContext);
      this.emit("response", response);
    } catch (error) {
      this.logger?.error("Failed to process input", { error });
      this.emit("error", error);
    }
  }

  /**
   * Handle user input - must be implemented by subclasses
   */
  protected abstract handleInput(
    input: string,
    context: MessageContext,
  ): Promise<string>;

  /**
   * Handle local commands specific to the interface
   */
  protected abstract handleLocalCommand(
    command: string,
    context: MessageContext,
  ): Promise<string | null>;

  /**
   * Process a message through the Shell
   */
  protected async processMessage(
    content: string,
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
        await this.context.generateContent<DefaultQueryResponse>(
          "shell:knowledge-query",
          {
            prompt: content,
            data: {
              userId: context.userId,
              conversationId: context.channelId,
              messageId: context.messageId,
              threadId: context.threadId,
              timestamp: context.timestamp.toISOString(),
            },
          },
        );

      // Format response using interface-specific template
      return this.formatResponse(queryResponse, context);
    });

    if (!result) {
      throw new Error("No response from query processor");
    }

    return result;
  }

  /**
   * Format the response for the specific interface
   */
  protected abstract formatResponse(
    queryResponse: DefaultQueryResponse,
    context: MessageContext,
  ): Promise<string>;
}
