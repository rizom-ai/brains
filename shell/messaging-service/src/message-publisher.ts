import type { Logger } from "@brains/utils/logger";
import type { InternalMessageResponse, MessageWithPayload } from "./types";
import type { HandlerEntry, HandlerRegistry } from "./handler-registry";
import {
  collectHandlerResponses,
  publishBroadcast,
  publishRequest,
} from "./message-dispatcher";

/**
 * Resolves matching subscriptions and dispatches messages through the selected
 * delivery mode.
 */
export class MessagePublisher {
  private readonly registry: HandlerRegistry;
  private readonly logger: Logger;
  constructor(registry: HandlerRegistry, logger: Logger) {
    this.registry = registry;
    this.logger = logger;
  }

  async publish<T = unknown>(
    message: MessageWithPayload<T>,
    broadcast?: boolean,
  ): Promise<InternalMessageResponse | null> {
    const entries = this.resolveMatchingHandlers(message);
    if (!entries) return null;

    return broadcast === true
      ? publishBroadcast(message, entries, this.logger)
      : publishRequest(message, entries, this.logger);
  }

  async collect<T = unknown>(
    message: MessageWithPayload<T>,
  ): Promise<InternalMessageResponse[]> {
    const entries = this.resolveMatchingHandlers(message);
    if (!entries) return [];
    return collectHandlerResponses(message, entries, this.logger);
  }

  private resolveMatchingHandlers<T>(
    message: MessageWithPayload<T>,
  ): HandlerEntry[] | undefined {
    if (typeof message !== "object" || !message.type || !message.id) {
      this.logger.error(
        "Invalid message structure - missing required fields 'id' or 'type'",
      );
      return undefined;
    }

    const { type } = message;
    this.logger.debug(`Publishing message of type: ${type}`, {
      source: message.source,
      target: message.target,
      hasMetadata: !!message.metadata,
    });

    const matchingHandlers = this.registry.getMatchingHandlers(type, message);
    if (!matchingHandlers) {
      this.logger.debug(`No handlers found for message type: ${type}`);
      return undefined;
    }

    if (matchingHandlers.entries.length === 0) {
      this.logger.debug(`No matching handlers for message type: ${type}`, {
        totalHandlers: matchingHandlers.totalHandlers,
        target: message.target,
      });
      return undefined;
    }

    return matchingHandlers.entries;
  }
}
