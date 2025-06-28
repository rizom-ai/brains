import { BrainsError, normalizeError, type ErrorCause } from "@brains/utils";

/**
 * Base error class for site-builder plugin operations
 */
export class SiteBuilderError extends BrainsError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(
      message,
      "SITE_BUILDER_ERROR",
      normalizeError(cause),
      context ?? {}
    );
  }
}

/**
 * Error thrown when site building process fails
 */
export class SiteBuildError extends SiteBuilderError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "SiteBuildError";
  }
}

/**
 * Error thrown when content generation fails
 */
export class ContentGenerationError extends SiteBuilderError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "ContentGenerationError";
  }
}

/**
 * Error thrown when content promotion fails
 */
export class ContentPromotionError extends SiteBuilderError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "ContentPromotionError";
  }
}

/**
 * Error thrown when template processing fails
 */
export class TemplateProcessingError extends SiteBuilderError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "TemplateProcessingError";
  }
}

/**
 * Error thrown when hydration process fails
 */
export class HydrationError extends SiteBuilderError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "HydrationError";
  }
}

/**
 * Error thrown when CSS processing fails
 */
export class CssProcessingError extends SiteBuilderError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "CssProcessingError";
  }
}

/**
 * Error thrown when plugin initialization fails
 */
export class SiteBuilderInitializationError extends SiteBuilderError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "SiteBuilderInitializationError";
  }
}