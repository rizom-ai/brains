import type { z } from "zod";
import type { Logger } from "./logger";
import { BrainsError, normalizeError, type ErrorCause } from "./errors";

/**
 * Error thrown when content validation fails
 */
export class ContentValidationError extends BrainsError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(
      message,
      "CONTENT_VALIDATION_ERROR",
      normalizeError(cause),
      context ?? {},
    );
  }
}

/**
 * Error thrown when schema is not found or invalid
 */
export class SchemaNotFoundError extends BrainsError {
  constructor(
    contentType: string,
    cause?: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(
      `No schema registered for content type: ${contentType}`,
      "SCHEMA_NOT_FOUND",
      cause ? normalizeError(cause) : new Error("Schema not found"),
      { contentType, ...context },
    );
  }
}

/**
 * Validates content against registered schemas
 */
export class ContentValidator {
  private schemas: Map<string, z.ZodType<unknown>> = new Map();
  private logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Register a schema for a content type
   */
  public register(contentType: string, schema: z.ZodType<unknown>): void {
    this.schemas.set(contentType, schema);
    this.logger?.debug(`Registered schema for content type: ${contentType}`);
  }

  /**
   * Validate content against its schema
   */
  public validate(contentType: string, content: unknown): unknown {
    const schema = this.schemas.get(contentType);
    if (!schema) {
      throw new SchemaNotFoundError(contentType);
    }

    try {
      return schema.parse(content);
    } catch (error) {
      const validationError = new ContentValidationError(
        `Validation failed for content type: ${contentType}`,
        error,
        { contentType, content },
      );
      this.logger?.error(validationError.message, { error: validationError });
      throw validationError;
    }
  }

  /**
   * Check if a schema is registered
   */
  public hasSchema(contentType: string): boolean {
    return this.schemas.has(contentType);
  }

  /**
   * Get a registered schema
   */
  public getSchema(contentType: string): z.ZodType<unknown> | undefined {
    return this.schemas.get(contentType);
  }

  /**
   * List all registered content types
   */
  public listContentTypes(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Safe validation that returns null on failure
   */
  public safeParse(contentType: string, content: unknown): unknown {
    try {
      return this.validate(contentType, content);
    } catch (error) {
      this.logger?.warn(`Safe parse failed for content type: ${contentType}`, {
        error,
      });
      return null;
    }
  }
}
