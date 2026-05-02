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
import { compileFilter, matchesFilter } from "./filter-matcher";
import { createMessage, toInternalResponse } from "./message-factory";
import {
  validateMessage as validateWithSchema,
  type MessageValidationResult,
} from "./message-validator";

// Internal type for wrapped handlers
type WrappedHandler = (
  message: MessageWithPayload<unknown>,
) => Promise<InternalMessageResponse | null>;

// Handler entry with original handler reference for exact unsubscription
interface HandlerEntry {
  handler: WrappedHandler;
  originalHandler: unknown;
  filter?: SubscriptionFilter;
}

/**
 * Message bus for handling messages between components
 * Implements Component Interface Standardization pattern
 */
export class MessageBus implements IMessageBus {
  private static instance: MessageBus | null = null;

  // Store handlers with optional filters
  private handlers = new Map<string, Set<HandlerEntry>>();
  private logger: Logger;

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
    const entry = this.createHandlerEntry(handler, filter);
    this.getOrCreateHandlers(type).add(entry);

    this.logger.debug(`Registered handler for message type: ${type}`, {
      hasFilter: !!filter,
      filterTarget: filter?.target,
    });

    // Return unsubscribe function for this specific subscription
    return () => {
      this.removeHandlerEntry(type, entry);
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
    const handlers = this.handlers.get(type);

    this.logger.debug(`Publishing message of type: ${type}`, {
      source: message.source,
      target: message.target,
      hasMetadata: !!message.metadata,
    });

    // If no handlers, log warning and return null
    if (!handlers || handlers.size === 0) {
      this.logger.debug(`No handlers found for message type: ${type}`);
      return null;
    }

    // Filter handlers based on their subscription filters
    const matchingHandlers = Array.from(handlers).filter((entry) =>
      matchesFilter(message, entry.filter),
    );

    if (matchingHandlers.length === 0) {
      this.logger.debug(`No matching handlers for message type: ${type}`, {
        totalHandlers: handlers.size,
        target: message.target,
      });
      return null;
    }

    return broadcast === true
      ? this.publishBroadcast(message, matchingHandlers)
      : this.publishRequest(message, matchingHandlers);
  }

  private async publishBroadcast(
    message: MessageWithPayload<unknown>,
    handlers: HandlerEntry[],
  ): Promise<null> {
    // For broadcast messages, call ALL matching handlers regardless of responses
    for (const entry of handlers) {
      try {
        await entry.handler(message);
      } catch (error) {
        this.logger.error(
          `Error in message handler for ${message.type}`,
          error,
        );
      }
    }
    return null; // Broadcast messages don't return responses
  }

  private async publishRequest(
    message: MessageWithPayload<unknown>,
    handlers: HandlerEntry[],
  ): Promise<InternalMessageResponse | null> {
    // For regular messages, call handlers until one returns a response
    for (const entry of handlers) {
      try {
        const response = await entry.handler(message);
        if (response) {
          return response;
        }
      } catch (error) {
        this.logger.error(
          `Error in message handler for ${message.type}`,
          error,
        );
      }
    }
    return null;
  }

  private createHandlerEntry<T, R>(
    handler: MessageHandler<T, R>,
    filter?: SubscriptionFilter,
  ): HandlerEntry {
    const entry = {
      handler: this.wrapHandler(handler),
      originalHandler: handler,
    };

    return filter ? { ...entry, filter: compileFilter(filter) } : entry;
  }

  private wrapHandler<T, R>(handler: MessageHandler<T, R>): WrappedHandler {
    return async (message: MessageWithPayload<unknown>) => {
      const typedMessage = message as MessageWithPayload<T>;
      const result = await handler(typedMessage);
      return toInternalResponse(message.id, result);
    };
  }

  private getOrCreateHandlers(type: string): Set<HandlerEntry> {
    let handlers = this.handlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(type, handlers);
    }
    return handlers;
  }

  private removeHandlerEntry(type: string, entry: HandlerEntry): boolean {
    const handlers = this.handlers.get(type);
    if (!handlers) return false;

    const removed = handlers.delete(entry);
    if (handlers.size === 0) {
      this.handlers.delete(type);
    }
    return removed;
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
    const handlers = this.handlers.get(messageType);
    return handlers !== undefined && handlers.size > 0;
  }

  /**
   * Unsubscribe from messages (implements IMessageBus interface)
   */
  unsubscribe<T = unknown, R = unknown>(
    type: string,
    handler: MessageHandler<T, R>,
  ): void {
    const handlers = this.handlers.get(type);
    if (!handlers) return;

    for (const entry of Array.from(handlers)) {
      if (entry.originalHandler === handler) {
        handlers.delete(entry);
      }
    }

    if (handlers.size === 0) {
      this.handlers.delete(type);
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

  /**
   * Get the number of handlers with a specific target filter
   */
  getTargetedHandlerCount(messageType: string, target: string): number {
    const handlers = this.handlers.get(messageType);
    if (!handlers) return 0;

    return Array.from(handlers).filter(
      (entry) => entry.filter?.target === target,
    ).length;
  }
}
