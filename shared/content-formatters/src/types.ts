/**
 * Formatter Types
 *
 * Simple interfaces for formatting structured data into human-readable markdown.
 */

/**
 * Base interface for schema formatters (API response formatting)
 */
export interface SchemaFormatter<T = unknown> {
  /**
   * Format data into human-readable markdown text
   * @param data - The data to format
   * @returns Formatted markdown string
   */
  format(data: T): string;

  /**
   * Check if this formatter can handle the given data
   * @param data - The data to check
   * @returns True if this formatter can handle the data
   */
  canFormat(data: unknown): boolean;
}

/**
 * Interface for content formatters (human-editable content formatting)
 *
 * ContentFormatters handle bidirectional transformation between structured data
 * and human-editable markdown templates. Unlike SchemaFormatters which are for
 * one-way API response formatting, ContentFormatters support parsing edited
 * content back into structured data.
 */
export interface ContentFormatter<T = unknown> {
  /**
   * Format structured data into human-editable markdown
   * @param data - The structured data to format
   * @returns Human-editable markdown representation
   */
  format(data: T): string;

  /**
   * Parse human-editable markdown back into structured data
   * @param content - The markdown content to parse
   * @returns Structured data parsed from the markdown
   * @throws Error if the content cannot be parsed
   */
  parse(content: string): T;
}
