import type { z } from "zod";
import type { Logger } from "@brains/utils";

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
      throw new Error(`No schema registered for content type: ${contentType}`);
    }

    try {
      return schema.parse(content);
    } catch (error) {
      this.logger?.error(`Validation failed for content type: ${contentType}`, {
        error,
        content,
      });
      throw error;
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
  public safeParse(
    contentType: string,
    content: unknown,
  ): unknown | null {
    try {
      return this.validate(contentType, content);
    } catch (error) {
      this.logger?.warn(
        `Safe parse failed for content type: ${contentType}`,
        { error },
      );
      return null;
    }
  }
}