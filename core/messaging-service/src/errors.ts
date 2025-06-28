/**
 * Messaging Service specific error classes
 * Domain-specific errors for message bus operations
 */

import { BrainsError, type ErrorCause } from "@brains/utils";

/**
 * Message delivery error
 */
export class MessageDeliveryError extends BrainsError {
  constructor(
    messageType: string,
    targetHandler?: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = targetHandler
      ? `Message delivery failed for type "${messageType}" to handler "${targetHandler}"`
      : `Message delivery failed for type "${messageType}"`;
    
    super(message, "MESSAGE_DELIVERY_FAILED", cause, {
      messageType,
      targetHandler,
      ...context,
    });
  }
}

/**
 * Handler registration error
 */
export class HandlerRegistrationError extends BrainsError {
  constructor(
    messageType: string,
    handlerName: string,
    reason: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Handler registration failed for message type "${messageType}": ${reason}`,
      "HANDLER_REGISTRATION_FAILED",
      cause,
      { messageType, handlerName, reason, ...context },
    );
  }
}

/**
 * Handler execution error
 */
export class HandlerExecutionError extends BrainsError {
  constructor(
    messageType: string,
    handlerName: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Handler execution failed for message type "${messageType}" in handler "${handlerName}"`,
      "HANDLER_EXECUTION_FAILED",
      cause,
      { messageType, handlerName, ...context },
    );
  }
}

/**
 * Message timeout error
 */
export class MessageTimeoutError extends BrainsError {
  constructor(
    messageType: string,
    timeoutMs: number,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Message timeout (${timeoutMs}ms) for message type "${messageType}"`,
      "MESSAGE_TIMEOUT",
      cause,
      { messageType, timeoutMs, ...context },
    );
  }
}

/**
 * Invalid message format error
 */
export class InvalidMessageFormatError extends BrainsError {
  constructor(
    messageType: string,
    validationError: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Invalid message format for type "${messageType}": ${validationError}`,
      "INVALID_MESSAGE_FORMAT",
      cause,
      { messageType, validationError, ...context },
    );
  }
}

/**
 * Message bus not initialized error
 */
export class MessageBusNotInitializedError extends BrainsError {
  constructor(
    operation: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Message bus not initialized for operation: ${operation}`,
      "MESSAGE_BUS_NOT_INITIALIZED",
      cause,
      { operation, ...context },
    );
  }
}

/**
 * Circular message dependency error
 */
export class CircularMessageDependencyError extends BrainsError {
  constructor(
    messageChain: string[],
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Circular message dependency detected: ${messageChain.join(" -> ")}`,
      "CIRCULAR_MESSAGE_DEPENDENCY",
      cause,
      { messageChain, ...context },
    );
  }
}