import type { Logger } from "@brains/utils";
import type { MessageBus } from "../messaging/messageBus";
import { MessageFactory } from "../messaging/messageFactory";
import type { BaseMessage, MessageResponse } from "../messaging/types";
import { z } from "zod";

/**
 * Brain Protocol - handles protocol-level message routing and processing
 *
 * This class serves as the protocol handler for the Brain system,
 * managing message validation, routing, and protocol-level concerns.
 * It does NOT handle commands - all functionality is exposed through tools.
 *
 * Implements Component Interface Standardization pattern
 */
export class BrainProtocol {
  private static instance: BrainProtocol | null = null;

  private readonly logger: Logger;
  private readonly messageBus: MessageBus;

  /**
   * Get the singleton instance of BrainProtocol
   */
  public static getInstance(
    logger: Logger,
    messageBus: MessageBus,
  ): BrainProtocol {
    if (!BrainProtocol.instance) {
      BrainProtocol.instance = new BrainProtocol(logger, messageBus);
    }
    return BrainProtocol.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    BrainProtocol.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    logger: Logger,
    messageBus: MessageBus,
  ): BrainProtocol {
    return new BrainProtocol(logger, messageBus);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger, messageBus: MessageBus) {
    this.logger = logger;
    this.messageBus = messageBus;

    // Set up message bus handlers for protocol-level concerns
    this.setupMessageHandlers();
  }

  /**
   * Set up message bus handlers for protocol messages
   */
  private setupMessageHandlers(): void {
    // Handle protocol-level messages if needed
    // For now, we mainly route through the message bus

    this.logger.info("Brain Protocol initialized");
  }

  /**
   * Process a message through the protocol
   * This is the main entry point for protocol-level message handling
   */
  public async processMessage(message: unknown): Promise<MessageResponse> {
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
      const response = await this.messageBus.publish(message as BaseMessage);

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
  public validateMessage<T>(
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
}
