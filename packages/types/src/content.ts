import type { z } from "zod";
import type { ContentFormatter } from "./formatters";
import type { ContentTemplate } from "./plugin";

/**
 * Unified content configuration that combines template, schema, and formatter
 */
export interface ContentConfig<T = unknown> {
  /**
   * Content template with generation configuration
   */
  template: ContentTemplate<T>;
  
  /**
   * Content formatter for bidirectional conversion
   */
  formatter: ContentFormatter<T>;
  
  /**
   * Zod schema for validation (can be derived from template.schema)
   */
  schema: z.ZodType<T>;
}

/**
 * Unified content registry that combines templates and formatters
 */
export interface ContentRegistry {
  /**
   * Register a content configuration
   */
  registerContent<T>(
    name: string,
    config: ContentConfig<T>,
  ): void;

  /**
   * Get content template
   */
  getTemplate<T = unknown>(name: string): ContentTemplate<T> | null;

  /**
   * Get content formatter
   */
  getFormatter<T = unknown>(name: string): ContentFormatter<T> | null;

  /**
   * Generate content using registered template
   */
  generateContent<T>(templateName: string, context: unknown): Promise<T>;

  /**
   * Parse content using registered formatter
   */
  parseContent<T>(templateName: string, content: string): T;

  /**
   * Format content using registered formatter
   */
  formatContent(templateName: string, data: unknown): string;

  /**
   * List all registered content names
   */
  listContent(namespace?: string): string[];

  /**
   * Check if content is registered
   */
  hasContent(name: string): boolean;

  /**
   * Clear all registrations
   */
  clear(): void;
}
