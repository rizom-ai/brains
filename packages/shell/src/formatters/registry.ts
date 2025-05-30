import type { Logger } from "@brains/utils";
import type { SchemaFormatter } from "@brains/types";
import type { ISchemaFormatterRegistry } from "./types";

/**
 * Registry for managing schema formatters
 * 
 * Follows the Component Interface Standardization pattern
 */
export class SchemaFormatterRegistry implements ISchemaFormatterRegistry {
  private static instance: SchemaFormatterRegistry | null = null;
  
  private formatters = new Map<string, SchemaFormatter>();
  private defaultFormatter: SchemaFormatter;

  /**
   * Get singleton instance
   */
  public static getInstance(
    dependencies?: { defaultFormatter: SchemaFormatter; logger?: Logger }
  ): SchemaFormatterRegistry {
    if (!SchemaFormatterRegistry.instance) {
      if (!dependencies?.defaultFormatter) {
        throw new Error("Default formatter required for first initialization");
      }
      SchemaFormatterRegistry.instance = new SchemaFormatterRegistry(dependencies);
    }
    return SchemaFormatterRegistry.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    SchemaFormatterRegistry.instance = null;
  }

  /**
   * Create a fresh instance (for testing)
   */
  public static createFresh(
    dependencies: { defaultFormatter: SchemaFormatter; logger?: Logger }
  ): SchemaFormatterRegistry {
    return new SchemaFormatterRegistry(dependencies);
  }

  private constructor(
    private dependencies: { defaultFormatter: SchemaFormatter; logger?: Logger }
  ) {
    this.defaultFormatter = dependencies.defaultFormatter;
  }

  /**
   * Register a formatter for a specific schema
   */
  public register(schemaName: string, formatter: SchemaFormatter): void {
    this.formatters.set(schemaName, formatter);
    this.dependencies.logger?.debug(`Registered formatter for schema: ${schemaName}`);
  }

  /**
   * Format data using the appropriate formatter
   */
  public format(data: unknown, schemaName?: string): string {
    // 1. Try specific formatter if schemaName provided
    if (schemaName && this.formatters.has(schemaName)) {
      const formatter = this.formatters.get(schemaName);
      if (formatter) {
        return formatter.format(data);
      }
    }

    // 2. Try to find a formatter that can handle this data
    for (const [name, formatter] of this.formatters) {
      if (formatter.canFormat(data)) {
        this.dependencies.logger?.debug(`Using formatter: ${name}`);
        return formatter.format(data);
      }
    }

    // 3. Use default formatter
    this.dependencies.logger?.debug("Using default formatter");
    return this.defaultFormatter.format(data);
  }

  /**
   * Get a specific formatter by name
   */
  public getFormatter(schemaName: string): SchemaFormatter | null {
    return this.formatters.get(schemaName) ?? null;
  }

  /**
   * Check if a formatter is registered for a schema
   */
  public hasFormatter(schemaName: string): boolean {
    return this.formatters.has(schemaName);
  }

  /**
   * Remove a formatter from the registry
   */
  public unregister(schemaName: string): void {
    this.formatters.delete(schemaName);
    this.dependencies.logger?.debug(`Unregistered formatter for schema: ${schemaName}`);
  }

  /**
   * Get all registered schema names
   */
  public getRegisteredSchemas(): string[] {
    return Array.from(this.formatters.keys());
  }

  /**
   * Set the default formatter
   */
  public setDefaultFormatter(formatter: SchemaFormatter): void {
    this.defaultFormatter = formatter;
  }
}