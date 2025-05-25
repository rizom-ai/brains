import type { Logger } from "@brains/utils";
import type { BaseMessage, MessageResponse } from "./types";

/**
 * Message bus for handling messages between components
 * Implements Component Interface Standardization pattern
 */
export class MessageBus {
  private static instance: MessageBus | null = null;

  // Store handlers without type information - they handle validation internally
  private handlers = new Map<
    string,
    Set<(message: BaseMessage) => Promise<MessageResponse | null>>
  >();
  private logger: Logger;

  /**
   * Get the singleton instance of MessageBus
   */
  public static getInstance(logger: Logger): MessageBus {
    if (!MessageBus.instance) {
      MessageBus.instance = new MessageBus(logger);
    }
    return MessageBus.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    MessageBus.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(logger: Logger): MessageBus {
    return new MessageBus(logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register a handler for a specific message type
   */
  registerHandler(
    messageType: string,
    handler: (message: BaseMessage) => Promise<MessageResponse | null>,
  ): void {
    if (!this.handlers.has(messageType)) {
      this.handlers.set(messageType, new Set());
    }

    const handlers = this.handlers.get(messageType);
    if (handlers) {
      handlers.add(handler);
    }
    this.logger.info(`Registered handler for message type: ${messageType}`);
  }

  /**
   * Publish a message to all handlers
   */
  async publish(message: BaseMessage): Promise<MessageResponse | null> {
    const { type } = message;
    const handlers = this.handlers.get(type) ?? new Set();

    this.logger.debug(`Publishing message of type: ${type}`);

    // If no handlers, log warning and return null
    if (handlers.size === 0) {
      this.logger.warn(`No handlers found for message type: ${type}`);
      return null;
    }

    // Call handlers in sequence until one returns a response
    for (const handler of handlers) {
      try {
        const response = await handler(message);
        if (response) {
          return response;
        }
      } catch (error) {
        this.logger.error(`Error in message handler for ${type}`, error);
      }
    }

    return null;
  }

  /**
   * Check if a message type has handlers
   */
  hasHandlers(messageType: string): boolean {
    const handlers = this.handlers.get(messageType);
    return handlers !== undefined && handlers.size > 0;
  }

  /**
   * Unregister a handler for a specific message type
   */
  unregisterHandler(
    messageType: string,
    handler: (message: BaseMessage) => Promise<MessageResponse | null>,
  ): void {
    const handlers = this.handlers.get(messageType);
    if (handlers) {
      handlers.delete(handler);
      this.logger.info(`Unregistered handler for message type: ${messageType}`);
    }
  }

  /**
   * Clear all handlers for a specific message type
   */
  clearHandlers(messageType: string): void {
    if (this.handlers.has(messageType)) {
      this.handlers.delete(messageType);
      this.logger.info(`Cleared all handlers for message type: ${messageType}`);
    }
  }

  /**
   * Clear all handlers
   */
  clearAllHandlers(): void {
    this.handlers.clear();
    this.logger.info("Cleared all message handlers");
  }

  /**
   * Get the number of handlers for a message type
   */
  getHandlerCount(messageType: string): number {
    return this.handlers.get(messageType)?.size ?? 0;
  }
}
