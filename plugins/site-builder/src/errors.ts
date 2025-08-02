/**
 * Base error class for site-builder plugin operations
 */
export class SiteBuilderError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SiteBuilderError";
  }
}

/**
 * Error thrown when site building process fails
 */
export class SiteBuildError extends SiteBuilderError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "SiteBuildError";
  }
}

/**
 * Error thrown when content generation fails
 */
export class ContentGenerationError extends SiteBuilderError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "ContentGenerationError";
  }
}

/**
 * Error thrown when content promotion fails
 */
export class ContentPromotionError extends SiteBuilderError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "ContentPromotionError";
  }
}

/**
 * Error thrown when template processing fails
 */
export class TemplateProcessingError extends SiteBuilderError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "TemplateProcessingError";
  }
}

/**
 * Error thrown when hydration process fails
 */
export class HydrationError extends SiteBuilderError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "HydrationError";
  }
}

/**
 * Error thrown when CSS processing fails
 */
export class CssProcessingError extends SiteBuilderError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "CssProcessingError";
  }
}

/**
 * Error thrown when plugin initialization fails
 */
export class SiteBuilderInitializationError extends SiteBuilderError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "SiteBuilderInitializationError";
  }
}
