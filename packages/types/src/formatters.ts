/**
 * Schema Formatter Types for Plugins
 * 
 * Simple interfaces for formatting structured data into human-readable markdown.
 */

/**
 * Base interface for schema formatters
 */
export interface SchemaFormatter {
  /**
   * Format data into human-readable markdown text
   * @param data - The data to format
   * @returns Formatted markdown string
   */
  format(data: unknown): string;

  /**
   * Check if this formatter can handle the given data
   * @param data - The data to check
   * @returns True if this formatter can handle the data
   */
  canFormat(data: unknown): boolean;
}