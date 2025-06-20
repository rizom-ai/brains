import type { z } from "zod";
import type { ContentFormatter, ContentTypeRegistry as IContentTypeRegistry } from "@brains/types";

export class ContentTypeRegistry implements IContentTypeRegistry {
  private static instance: ContentTypeRegistry | null = null;
  private schemas = new Map<string, z.ZodType<unknown>>();
  private formatters = new Map<string, ContentFormatter<unknown>>();

  // Singleton access
  public static getInstance(): ContentTypeRegistry {
    ContentTypeRegistry.instance ??= new ContentTypeRegistry();
    return ContentTypeRegistry.instance;
  }

  // Testing reset
  public static resetInstance(): void {
    ContentTypeRegistry.instance = null;
  }

  // Isolated instance creation
  public static createFresh(): ContentTypeRegistry {
    return new ContentTypeRegistry();
  }

  // Private constructor to enforce factory methods
  private constructor() {
    // Initialization
  }

  /**
   * Register a schema for a content type with optional formatter
   * Content types must be namespaced (e.g., "plugin:category:type")
   */
  public register(
    contentType: string,
    schema: z.ZodType<unknown>,
    formatter?: ContentFormatter<unknown>,
  ): void {
    // Validate namespace format
    if (!contentType.includes(":")) {
      throw new Error(
        `Content type must be namespaced (e.g., "plugin:category:type"): ${contentType}`,
      );
    }
    this.schemas.set(contentType, schema);

    // Store formatter if provided
    if (formatter) {
      this.formatters.set(contentType, formatter);
    }
  }

  /**
   * Get schema for a content type
   */
  public get(contentType: string): z.ZodType<unknown> | null {
    return this.schemas.get(contentType) ?? null;
  }

  /**
   * List all registered content types
   * Optionally filter by namespace
   */
  public list(namespace?: string): string[] {
    const types = Array.from(this.schemas.keys());
    if (namespace) {
      return types.filter((t) => t.startsWith(`${namespace}:`));
    }
    return types;
  }

  /**
   * Check if a content type is registered
   */
  public has(contentType: string): boolean {
    return this.schemas.has(contentType);
  }

  /**
   * Get formatter for a content type
   */
  public getFormatter<T = unknown>(
    contentType: string,
  ): ContentFormatter<T> | null {
    const formatter = this.formatters.get(contentType);
    return formatter ? (formatter as ContentFormatter<T>) : null;
  }

  /**
   * Clear all registered schemas and formatters
   * Useful for testing
   */
  public clear(): void {
    this.schemas.clear();
    this.formatters.clear();
  }
}
