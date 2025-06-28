/**
 * AI Service specific error classes
 * Domain-specific errors for AI operations
 */

import { BrainsError, type ErrorCause } from "@brains/utils";

/**
 * Model not available error
 */
export class ModelNotAvailableError extends BrainsError {
  constructor(
    modelName: string,
    reason?: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = reason
      ? `AI model not available: ${modelName} (${reason})`
      : `AI model not available: ${modelName}`;

    super(message, "AI_MODEL_NOT_AVAILABLE", cause, {
      modelName,
      reason,
      ...context,
    });
  }
}

/**
 * Generation timeout error
 */
export class GenerationTimeoutError extends BrainsError {
  constructor(
    timeoutMs: number,
    operation?: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = operation
      ? `AI generation timeout (${timeoutMs}ms) for operation: ${operation}`
      : `AI generation timeout (${timeoutMs}ms)`;

    super(message, "AI_GENERATION_TIMEOUT", cause, {
      timeoutMs,
      operation,
      ...context,
    });
  }
}

/**
 * Token limit exceeded error
 */
export class TokenLimitError extends BrainsError {
  constructor(
    tokenCount: number,
    maxTokens: number,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Token limit exceeded: ${tokenCount} > ${maxTokens}`,
      "AI_TOKEN_LIMIT_EXCEEDED",
      cause,
      { tokenCount, maxTokens, ...context },
    );
  }
}

/**
 * Model configuration error
 */
export class ModelConfigError extends BrainsError {
  constructor(
    configField: string,
    value: unknown,
    reason: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Invalid AI model configuration for ${configField}: ${reason}`,
      "AI_MODEL_CONFIG_ERROR",
      cause,
      { configField, value, reason, ...context },
    );
  }
}

/**
 * Generation failure error
 */
export class GenerationFailureError extends BrainsError {
  constructor(
    operation: "text" | "object" | "structured",
    reason?: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = reason
      ? `AI ${operation} generation failed: ${reason}`
      : `AI ${operation} generation failed`;

    super(message, "AI_GENERATION_FAILED", cause, {
      operation,
      reason,
      ...context,
    });
  }
}

/**
 * Rate limiting error
 */
export class RateLimitError extends BrainsError {
  constructor(
    retryAfterSeconds?: number,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = retryAfterSeconds
      ? `AI service rate limited, retry after ${retryAfterSeconds} seconds`
      : "AI service rate limited";

    super(message, "AI_RATE_LIMITED", cause, {
      retryAfterSeconds,
      ...context,
    });
  }
}

/**
 * API key or authentication error
 */
export class AuthenticationError extends BrainsError {
  constructor(
    provider: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `AI service authentication failed for provider: ${provider}`,
      "AI_AUTHENTICATION_FAILED",
      cause,
      { provider, ...context },
    );
  }
}
