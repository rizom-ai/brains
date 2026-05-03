import type { Logger } from "@brains/utils";
import type { z } from "@brains/utils";
import type {
  InternalMessageResponse,
  MessageHandler,
  IMessageBus,
  MessageResponse,
  MessageWithPayload,
  SubscriptionFilter,
} from "./types";
import { HandlerRegistry } from "./handler-registry";
import { createMessage } from "./message-factory";
import { publishBroadcast, publishRequest } from "./message-dispatcher";
import {
  validateMessage as validateWithSchema,
  type MessageValidationResult,
} from "./message-validator";

/**
 * Message bus for handling messages between components
 * Implements Component Interface Standardization pattern
 */
export class MessageBus implements IMessageBus {
  private static instance: MessageBus | null = null;

  private readonly registry = new HandlerRegistry();
  private readonly logger: Logger;

  /**
   * Get the singleton instance of MessageBus
   */
  public static getInstance(logger: Logger): MessageBus {
    MessageBus.instance ??= new MessageBus(logger);
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
    handler: MessageHandler<T, R>,
    filter?: SubscriptionFilter,
  ): () => void {
    const entry = this.registry.add(type, handler, filter);

    this.logger.debug(`Registered handler for message type: ${type}`, {
      hasFilter: !!filter,
      filterTarget: filter?.target,
    });

    // Return unsubscribe function for this specific subscription
    return () => {
      this.registry.remove(type, entry);
    };
  }

  /**
   * Send a message and get response (implements IMessageBus interface)
   */
  async send<T = unknown, R = unknown>(
    type: string,
    payload: T,
    sender: string,
    target?: string,
    metadata?: Record<string, unknown>,
    broadcast?: boolean,
  ): Promise<MessageResponse<R>> {
    const message = createMessage(type, payload, sender, target, metadata);
    const response = await this.publish(message, broadcast);

    // Handle successful response
    if (response?.success) {
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
  private async publish<T = unknown>(
    message: MessageWithPayload<T>,
    broadcast?: boolean,
  ): Promise<InternalMessageResponse | null> {
    // Validate message structure
    if (typeof message !== "object" || !message.type || !message.id) {
      this.logger.error(
        "Invalid message structure - missing required fields 'id' or 'type'",
      );
      return null;
    }

    const { type } = message;

    this.logger.debug(`Publishing message of type: ${type}`, {
      source: message.source,
      target: message.target,
      hasMetadata: !!message.metadata,
    });

    const matchingHandlers = this.registry.getMatchingHandlers(type, message);

    // If no handlers, log warning and return null
    if (!matchingHandlers) {
      this.logger.debug(`No handlers found for message type: ${type}`);
      return null;
    }

    if (matchingHandlers.entries.length === 0) {
      this.logger.debug(`No matching handlers for message type: ${type}`, {
        totalHandlers: matchingHandlers.totalHandlers,
        target: message.target,
      });
      return null;
    }

    return broadcast === true
      ? publishBroadcast(message, matchingHandlers.entries, this.logger)
      : publishRequest(message, matchingHandlers.entries, this.logger);
  }

  /**
   * Validate a message against a schema
   */
  validateMessage<T>(
    message: unknown,
    schema: z.ZodSchema<T>,
  ): MessageValidationResult<T> {
    return validateWithSchema(message, schema);
  }

  /**
   * Check if a message type has handlers
   */
  hasHandlers(messageType: string): boolean {
    return this.registry.hasHandlers(messageType);
  }

  /**
   * Unsubscribe from messages (implements IMessageBus interface)
   */
  unsubscribe<T = unknown, R = unknown>(
    type: string,
    handler: MessageHandler<T, R>,
  ): void {
    this.registry.removeHandler(type, handler);
  }

  /**
   * Clear all handlers for a specific message type
   */
  clearHandlers(messageType: string): void {
    if (this.registry.clearHandlers(messageType)) {
      this.logger.info(`Cleared all handlers for message type: ${messageType}`);
    }
  }

  /**
   * Clear all handlers
   */
  clearAllHandlers(): void {
    this.registry.clearAllHandlers();
    this.logger.info("Cleared all message handlers");
  }

  /**
   * Get the number of handlers for a message type
   */
  getHandlerCount(messageType: string): number {
    return this.registry.getHandlerCount(messageType);
  }

  /**
   * Get the number of handlers with a specific target filter
   */
  getTargetedHandlerCount(messageType: string, target: string): number {
    return this.registry.getTargetedHandlerCount(messageType, target);
  }
}
