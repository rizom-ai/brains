import type { Logger } from "@brains/utils";
import type { InternalMessageResponse, MessageWithPayload } from "./types";
import type { HandlerRegistry } from "./handler-registry";
import { publishBroadcast, publishRequest } from "./message-dispatcher";

/**
 * Resolves matching subscriptions and dispatches messages through the selected
 * delivery mode.
 */
export class MessagePublisher {
  constructor(
    private readonly registry: HandlerRegistry,
    private readonly logger: Logger,
  ) {}

  async publish<T = unknown>(
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
}
