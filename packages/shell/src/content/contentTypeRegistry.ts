import type { z } from "zod";

export class ContentTypeRegistry {
  private static instance: ContentTypeRegistry | null = null;
  private schemas = new Map<string, z.ZodType<unknown>>();

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
   * Register a schema for a content type
   * Content types must be namespaced (e.g., "plugin:category:type")
   */
  public register(contentType: string, schema: z.ZodType<unknown>): void {
    // Validate namespace format
    if (!contentType.includes(":")) {
      throw new Error(
        `Content type must be namespaced (e.g., "plugin:category:type"): ${contentType}`,
      );
    }
    this.schemas.set(contentType, schema);
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
   * Clear all registered schemas
   * Useful for testing
   */
  public clear(): void {
    this.schemas.clear();
  }
}
