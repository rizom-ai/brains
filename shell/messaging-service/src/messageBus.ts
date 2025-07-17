import type { Logger } from "@brains/utils";
import type {
  InternalMessageResponse,
  MessageHandler,
  IMessageBus,
  MessageResponse,
  MessageWithPayload,
  SubscriptionFilter,
} from "./types";
import { z } from "zod";

// Internal type for wrapped handlers
type WrappedHandler = (
  message: MessageWithPayload<unknown>,
) => Promise<InternalMessageResponse | null>;

// Handler entry with filter
interface HandlerEntry {
  handler: WrappedHandler;
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
    const wrappedHandler: WrappedHandler = async (
      message: MessageWithPayload<unknown>,
    ): Promise<InternalMessageResponse | null> => {
      // Cast the message to the expected type for this specific handler
      const typedMessage = message as MessageWithPayload<T>;
      const result = await handler(typedMessage);

      // Handle noop responses for broadcast events
      if ("noop" in result) {
        return {
          id: `resp-${Date.now()}`,
          requestId: message.id,
          timestamp: new Date().toISOString(),
          success: true,
          data: undefined,
          error: undefined,
        };
      }

      // Type guard: if we get here, result must have success/data/error properties
      if ("success" in result) {
        return {
          id: `resp-${Date.now()}`,
          requestId: message.id,
          timestamp: new Date().toISOString(),
          success: result.success,
          data: result.data,
          error: result.error ? { message: result.error } : undefined,
        };
      }

      // This should never happen, but TypeScript needs it
      throw new Error("Invalid message response format");
    };

    const entry: HandlerEntry = filter
      ? { handler: wrappedHandler, filter }
      : { handler: wrappedHandler };

    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }

    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.add(entry);
    }
    this.logger.debug(`Registered handler for message type: ${type}`, {
      hasFilter: !!filter,
      filterTarget: filter?.target,
    });

    // Return unsubscribe function for this specific handler
    return () => {
      const handlers = this.handlers.get(type);
      if (handlers) {
        handlers.delete(entry);
        if (handlers.size === 0) {
          this.handlers.delete(type);
        }
      }
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
    const message: MessageWithPayload<T> = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: new Date().toISOString(),
      source: sender,
      target,
      metadata,
      payload,
    };

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
    const handlers = this.handlers.get(type) ?? new Set();

    this.logger.debug(`Publishing message of type: ${type}`, {
      source: message.source,
      target: message.target,
      hasMetadata: !!message.metadata,
    });

    // If no handlers, log warning and return null
    if (handlers.size === 0) {
      this.logger.warn(`No handlers found for message type: ${type}`);
      return null;
    }

    // Filter handlers based on their subscription filters
    const matchingHandlers = Array.from(handlers).filter((entry) =>
      this.matchesFilter(message, entry.filter),
    );

    if (matchingHandlers.length === 0) {
      this.logger.debug(`No matching handlers for message type: ${type}`, {
        totalHandlers: handlers.size,
        target: message.target,
      });
      return null;
    }

    // Check if this is a broadcast message
    const isBroadcast = broadcast === true;

    if (isBroadcast) {
      // For broadcast messages, call ALL matching handlers regardless of responses
      for (const entry of matchingHandlers) {
        try {
          await entry.handler(message);
        } catch (error) {
          this.logger.error(`Error in message handler for ${type}`, error);
        }
      }
      return null; // Broadcast messages don't return responses
    } else {
      // For regular messages, call handlers until one returns a response
      for (const entry of matchingHandlers) {
        try {
          const response = await entry.handler(message);
          if (response) {
            return response;
          }
        } catch (error) {
          this.logger.error(`Error in message handler for ${type}`, error);
        }
      }
      return null;
    }
  }

  /**
   * Check if a message matches a subscription filter
   */
  private matchesFilter(
    message: MessageWithPayload,
    filter?: SubscriptionFilter,
  ): boolean {
    if (!filter) {
      return true; // No filter means accept all messages
    }

    // Check source filter
    if (filter.source) {
      if (!this.matchesPattern(message.source, filter.source)) {
        return false;
      }
    }

    // Check target filter
    if (filter.target) {
      if (
        !message.target ||
        !this.matchesPattern(message.target, filter.target)
      ) {
        return false;
      }
    }

    // Check metadata filter
    if (filter.metadata) {
      if (!message.metadata) {
        return false;
      }
      // Check if all filter metadata keys match
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (message.metadata[key] !== value) {
          return false;
        }
      }
    }

    // Check custom predicate
    if (filter.predicate) {
      return filter.predicate(message);
    }

    return true;
  }

  /**
   * Check if a value matches a pattern (string or RegExp)
   */
  private matchesPattern(
    value: string | undefined,
    pattern: string | RegExp,
  ): boolean {
    if (!value) return false;

    if (pattern instanceof RegExp) {
      return pattern.test(value);
    }

    // Support simple wildcards for string patterns
    if (pattern.includes("*")) {
      const regexPattern = pattern
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      return new RegExp(`^${regexPattern}$`).test(value);
    }

    return value === pattern;
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
  unsubscribe<T = unknown, R = unknown>(
    type: string,
    _handler: MessageHandler<T, R>,
  ): void {
    // Since we wrap handlers, we need to clear all handlers for this type
    // This is a limitation of the current design
    this.clearHandlers(type);
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
