import type { Logger } from "@brains/utils";
import type { BaseMessage, MessageResponse } from "./types";
import type {
  MessageHandler as IMessageHandler,
  MessageWithPayload as IMessageWithPayload,
  MessageBus as IMessageBus,
} from "@brains/types";
import { MessageFactory } from "./messageFactory";
import { z } from "zod";

/**
 * Message bus for handling messages between components
 * Implements Component Interface Standardization pattern
 */
export class MessageBus implements IMessageBus {
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
   * Subscribe to messages (implements IMessageBus interface)
   */
  subscribe<T = unknown, R = unknown>(
    type: string,
    handler: IMessageHandler<T, R>,
  ): () => void {
    const wrappedHandler = async (
      message: BaseMessage,
    ): Promise<MessageResponse | null> => {
      if ("payload" in message) {
        // Convert from IMessageBus response to local MessageResponse
        const result = await handler(message as IMessageWithPayload<T>);

        return {
          id: `resp-${Date.now()}`,
          requestId: message.id,
          timestamp: new Date().toISOString(),
          success: result.success,
          data: result.data,
          error: result.error ? { message: result.error } : undefined,
        };
      }
      return null;
    };

    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }

    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.add(wrappedHandler);
    }
    this.logger.info(`Registered handler for message type: ${type}`);

    // Return unsubscribe function
    // We just clear all handlers for the type since we wrap them
    return () => this.clearHandlers(type);
  }

  /**
   * Register a handler for a specific message type (legacy method)
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
   * Send a message and get response (implements IMessageBus interface)
   */
  async send<T = unknown, R = unknown>(
    type: string,
    payload: T,
    sender?: string,
  ): Promise<{ success: boolean; data?: R; error?: string }> {
    const message: BaseMessage & { payload: T } = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: new Date().toISOString(),
      source: sender,
      payload,
    };

    const response = await this.publish(message as BaseMessage);
    if (response && response.success) {
      return {
        success: true,
        data: response.data as R,
      };
    }

    // Return error response if no handler found
    return {
      success: false,
      error:
        response?.error?.message ??
        `No handler found for message type: ${type}`,
    };
  }

  /**
   * Publish a message to all handlers (internal method)
   */
  async publish(message: BaseMessage): Promise<MessageResponse | null> {
    // Validate message structure
    if (!message || typeof message !== "object" || !message.type || !message.id) {
      this.logger.error("Invalid message structure - missing required fields 'id' or 'type'");
      return null;
    }

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
   * Process a message with full validation and error handling
   * This replaces the functionality that was in BrainProtocol
   */
  async processMessage(message: unknown): Promise<MessageResponse> {
    try {
      // Validate message structure
      if (
        typeof message !== "object" ||
        message === null ||
        !("type" in message) ||
        !("id" in message)
      ) {
        return MessageFactory.createErrorResponse(
          "unknown",
          "INVALID_MESSAGE",
          "Message must have 'id' and 'type' fields",
        );
      }

      // Route through message bus
      const response = await this.publish(message as BaseMessage);

      if (response) {
        return response;
      }

      // No handler found
      return MessageFactory.createErrorResponse(
        (message as BaseMessage).id,
        "NO_HANDLER",
        `No handler found for message type: ${(message as BaseMessage).type}`,
      );
    } catch (error) {
      this.logger.error("Error processing message", error);
      return MessageFactory.createErrorResponse(
        "unknown",
        "PROCESSING_ERROR",
        error instanceof Error ? error.message : "Failed to process message",
      );
    }
  }

  /**
   * Validate a message against a schema
   */
  validateMessage<T>(
    message: unknown,
    schema: z.ZodSchema<T>,
  ): { valid: true; data: T } | { valid: false; error: string } {
    try {
      const data = schema.parse(message);
      return { valid: true, data };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          error: error.errors[0]?.message ?? "Validation failed",
        };
      }
      return { valid: false, error: "Unknown validation error" };
    }
  }

  /**
   * Check if a message type has handlers
   */
  hasHandlers(messageType: string): boolean {
    const handlers = this.handlers.get(messageType);
    return handlers !== undefined && handlers.size > 0;
  }

  /**
   * Unsubscribe from messages (implements IMessageBus interface)
   */
  unsubscribe(type: string, _handler: IMessageHandler): void {
    // Since we wrap handlers, we need to clear all handlers for this type
    // This is a limitation of the current design
    this.clearHandlers(type);
  }

  /**
   * Unregister a handler for a specific message type (legacy method)
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
