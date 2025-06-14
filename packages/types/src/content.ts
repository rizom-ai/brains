import type { z } from "zod";
import type { ContentFormatter } from "./formatters";

/**
 * Registry for content types and their associated schemas and formatters
 */
export interface ContentTypeRegistry {
  /**
   * Register a schema for a content type with optional formatter
   * Content types must be namespaced (e.g., "plugin:category:type")
   */
  register(
    contentType: string,
    schema: z.ZodType<unknown>,
    formatter?: ContentFormatter<unknown>,
  ): void;

  /**
   * Get schema for a content type
   */
  get(contentType: string): z.ZodType<unknown> | null;

  /**
   * List all registered content types
   * Optionally filter by namespace
   */
  list(namespace?: string): string[];

  /**
   * Check if a content type is registered
   */
  has(contentType: string): boolean;

  /**
   * Get formatter for a content type
   */
  getFormatter<T = unknown>(contentType: string): ContentFormatter<T> | null;

  /**
   * Clear all registered schemas and formatters
   * Useful for testing
   */
  clear(): void;
}
