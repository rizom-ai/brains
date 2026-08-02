import type { Logger } from "@brains/utils/logger";
import type {
  MessageHandler,
  IMessageBus,
  MessageBusSendRequest,
  MessageResponse,
  SubscriptionFilter,
} from "./types";
import { HandlerRegistry } from "./handler-registry";
import { createMessage, toMessageResponse } from "./message-factory";
import { MessagePublisher } from "./message-publisher";
import {
  validateMessage as validateWithSchema,
  type MessageValidationResult,
  type MessageValidationSchema,
} from "./message-validator";

/**
 * Message bus for handling messages between components
 */
export class MessageBus implements IMessageBus {
  private readonly registry = new HandlerRegistry();
  private readonly publisher: MessagePublisher;
  private readonly logger: Logger;

  public static createFresh(logger: Logger): MessageBus {
    return new MessageBus(logger);
  }

  private constructor(logger: Logger) {
    this.logger = logger;
    this.publisher = new MessagePublisher(this.registry, logger);
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
    request: MessageBusSendRequest<T>,
  ): Promise<MessageResponse<R>> {
    const { type, payload, sender, target, metadata, broadcast } = request;
    const message = createMessage(type, payload, sender, target, metadata);
    const response = await this.publisher.publish(message, broadcast);
    return toMessageResponse<R>(type, response);
  }

  /** Collect one response from every matching handler in registration order. */
  async collect<T = unknown, R = unknown>(
    request: MessageBusSendRequest<T>,
  ): Promise<MessageResponse<R>[]> {
    const { type, payload, sender, target, metadata } = request;
    const message = createMessage(type, payload, sender, target, metadata);
    const responses = await this.publisher.collect(message);
    return responses.map((response) => toMessageResponse<R>(type, response));
  }

  /**
   * Validate a message against a schema
   */
  validateMessage<T>(
    message: unknown,
    schema: MessageValidationSchema<T>,
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
