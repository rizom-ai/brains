/**
 * Schema Formatter System Types
 * 
 * Internal types for the shell's formatter implementation.
 */

import type { SchemaFormatter } from "@brains/types";

/**
 * Registry for managing schema formatters
 */
export interface ISchemaFormatterRegistry {
  /**
   * Register a formatter for a specific schema
   * @param schemaName - Name of the schema
   * @param formatter - The formatter implementation
   */
  register(schemaName: string, formatter: SchemaFormatter): void;

  /**
   * Format data using the appropriate formatter
   * @param data - The data to format
   * @param schemaName - Optional schema name hint
   * @returns Formatted markdown string
   */
  format(data: unknown, schemaName?: string): string;

  /**
   * Get a specific formatter by name
   * @param schemaName - Name of the schema
   * @returns The formatter or null if not found
   */
  getFormatter(schemaName: string): SchemaFormatter | null;

  /**
   * Check if a formatter is registered for a schema
   * @param schemaName - Name of the schema
   * @returns True if a formatter is registered
   */
  hasFormatter(schemaName: string): boolean;

  /**
   * Remove a formatter from the registry
   * @param schemaName - Name of the schema
   */
  unregister(schemaName: string): void;

  /**
   * Get all registered schema names
   * @returns Array of schema names
   */
  getRegisteredSchemas(): string[];
}