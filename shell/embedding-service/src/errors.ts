/**
 * Embedding Service specific error classes
 * Domain-specific errors for embedding operations
 */

/**
 * Embedding generation error
 */
export class EmbeddingGenerationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EmbeddingGenerationError";
  }
}

/**
 * Embedding service unavailable error
 */
export class EmbeddingServiceUnavailableError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EmbeddingServiceUnavailableError";
  }
}

/**
 * Embedding cache error
 */
export class EmbeddingCacheError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EmbeddingCacheError";
  }
}

/**
 * Invalid embedding dimensions error
 */
export class InvalidEmbeddingDimensionsError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "InvalidEmbeddingDimensionsError";
  }
}

/**
 * Embedding model configuration error
 */
export class EmbeddingModelConfigError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EmbeddingModelConfigError";
  }
}

/**
 * Embedding rate limit error
 */
export class EmbeddingRateLimitError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EmbeddingRateLimitError";
  }
}
