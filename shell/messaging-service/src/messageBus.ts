import type { Logger } from "@brains/utils";
import type {
  InternalMessageResponse,
  MessageHandler,
  IMessageBus,
  MessageResponse,
  MessageWithPayload,
  SubscriptionFilter,
} from "./types";
import { z } from "@brains/utils";

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
    const message = this.createMessage(type, payload, sender, target, metadata);
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
      this.matchesFilter(message, entry.filter),
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

    return filter ? { ...entry, filter } : entry;
  }

  private wrapHandler<T, R>(handler: MessageHandler<T, R>): WrappedHandler {
    return async (message: MessageWithPayload<unknown>) => {
      const typedMessage = message as MessageWithPayload<T>;
      const result = await handler(typedMessage);
      return this.toInternalResponse(message.id, result);
    };
  }

  private toInternalResponse(
    requestId: string,
    result: MessageResponse<unknown>,
  ): InternalMessageResponse {
    // Handle noop responses for broadcast events
    if ("noop" in result) {
      return this.createInternalResponse(requestId, true);
    }

    // Type guard: if we get here, result must have success/data/error properties
    if ("success" in result) {
      return this.createInternalResponse(
        requestId,
        result.success,
        result.data,
        result.error,
      );
    }

    throw new Error("Invalid message response format");
  }

  private createInternalResponse(
    requestId: string,
    success: boolean,
    data?: unknown,
    error?: string,
  ): InternalMessageResponse {
    return {
      id: this.createResponseId(),
      requestId,
      timestamp: this.createTimestamp(),
      success,
      data,
      error: error ? { message: error } : undefined,
    };
  }

  private createMessage<T>(
    type: string,
    payload: T,
    sender: string,
    target?: string,
    metadata?: Record<string, unknown>,
  ): MessageWithPayload<T> {
    return {
      id: this.createMessageId(),
      type,
      timestamp: this.createTimestamp(),
      source: sender,
      target,
      metadata,
      payload,
    };
  }

  private createMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private createResponseId(): string {
    return `resp-${Date.now()}`;
  }

  private createTimestamp(): string {
    return new Date().toISOString();
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
      pattern.lastIndex = 0;
      const matches = pattern.test(value);
      pattern.lastIndex = 0;
      return matches;
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
          error: error.issues[0]?.message ?? "Validation failed",
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
