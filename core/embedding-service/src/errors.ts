/**
 * Embedding Service specific error classes
 * Domain-specific errors for embedding operations
 */

import { BrainsError, type ErrorCause } from "@brains/utils";

/**
 * Embedding generation error
 */
export class EmbeddingGenerationError extends BrainsError {
  constructor(
    text: string,
    reason?: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const truncatedText = text.length > 100 ? `${text.slice(0, 100)}...` : text;
    const message = reason
      ? `Embedding generation failed for text "${truncatedText}": ${reason}`
      : `Embedding generation failed for text "${truncatedText}"`;
    
    super(message, "EMBEDDING_GENERATION_FAILED", cause, {
      textLength: text.length,
      truncatedText,
      reason,
      ...context,
    });
  }
}

/**
 * Embedding service unavailable error
 */
export class EmbeddingServiceUnavailableError extends BrainsError {
  constructor(
    serviceName: string,
    reason?: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = reason
      ? `Embedding service unavailable: ${serviceName} (${reason})`
      : `Embedding service unavailable: ${serviceName}`;
    
    super(message, "EMBEDDING_SERVICE_UNAVAILABLE", cause, {
      serviceName,
      reason,
      ...context,
    });
  }
}

/**
 * Embedding cache error
 */
export class EmbeddingCacheError extends BrainsError {
  constructor(
    operation: "read" | "write" | "delete" | "clear",
    key?: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = key
      ? `Embedding cache ${operation} failed for key: ${key}`
      : `Embedding cache ${operation} failed`;
    
    super(message, "EMBEDDING_CACHE_ERROR", cause, {
      operation,
      key,
      ...context,
    });
  }
}

/**
 * Invalid embedding dimensions error
 */
export class InvalidEmbeddingDimensionsError extends BrainsError {
  constructor(
    expected: number,
    actual: number,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Invalid embedding dimensions: expected ${expected}, got ${actual}`,
      "EMBEDDING_INVALID_DIMENSIONS",
      cause,
      { expected, actual, ...context },
    );
  }
}

/**
 * Embedding model configuration error
 */
export class EmbeddingModelConfigError extends BrainsError {
  constructor(
    modelName: string,
    configField: string,
    reason: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Invalid embedding model configuration for ${modelName}.${configField}: ${reason}`,
      "EMBEDDING_MODEL_CONFIG_ERROR",
      cause,
      { modelName, configField, reason, ...context },
    );
  }
}

/**
 * Embedding rate limit error
 */
export class EmbeddingRateLimitError extends BrainsError {
  constructor(
    requestsPerMinute: number,
    retryAfterSeconds?: number,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = retryAfterSeconds
      ? `Embedding service rate limited (${requestsPerMinute}/min), retry after ${retryAfterSeconds} seconds`
      : `Embedding service rate limited (${requestsPerMinute}/min)`;
    
    super(message, "EMBEDDING_RATE_LIMITED", cause, {
      requestsPerMinute,
      retryAfterSeconds,
      ...context,
    });
  }
}