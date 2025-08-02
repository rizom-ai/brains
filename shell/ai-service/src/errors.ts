/**
 * AI Service specific error classes
 * Domain-specific errors for AI operations
 */

/**
 * Model not available error
 */
export class ModelNotAvailableError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ModelNotAvailableError";
  }
}

/**
 * Generation timeout error
 */
export class GenerationTimeoutError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GenerationTimeoutError";
  }
}

/**
 * Token limit exceeded error
 */
export class TokenLimitError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TokenLimitError";
  }
}

/**
 * Model configuration error
 */
export class ModelConfigError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ModelConfigError";
  }
}

/**
 * Generation failure error
 */
export class GenerationFailureError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GenerationFailureError";
  }
}

/**
 * Rate limiting error
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * API key or authentication error
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}