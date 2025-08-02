/**
 * Messaging Service specific error classes
 * Domain-specific errors for message bus operations
 */

/**
 * Message delivery error
 */
export class MessageDeliveryError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MessageDeliveryError";
  }
}

/**
 * Handler registration error
 */
export class HandlerRegistrationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HandlerRegistrationError";
  }
}

/**
 * Handler execution error
 */
export class HandlerExecutionError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HandlerExecutionError";
  }
}

/**
 * Message timeout error
 */
export class MessageTimeoutError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MessageTimeoutError";
  }
}

/**
 * Invalid message format error
 */
export class InvalidMessageFormatError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "InvalidMessageFormatError";
  }
}

/**
 * Message bus not initialized error
 */
export class MessageBusNotInitializedError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MessageBusNotInitializedError";
  }
}

/**
 * Circular message dependency error
 */
export class CircularMessageDependencyError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CircularMessageDependencyError";
  }
}
