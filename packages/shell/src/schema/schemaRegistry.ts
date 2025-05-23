import { z } from "zod";
import type { Logger } from "@personal-brain/utils";

/**
 * Registry for managing Zod schemas across the application
 * Implements Component Interface Standardization pattern
 */
export class SchemaRegistry {
  private static instance: SchemaRegistry | null = null;

  private schemas = new Map<string, z.ZodType<unknown>>();
  private logger: Logger;

  /**
   * Get the singleton instance of SchemaRegistry
   */
  public static getInstance(logger: Logger): SchemaRegistry {
    if (!SchemaRegistry.instance) {
      SchemaRegistry.instance = new SchemaRegistry(logger);
    }
    return SchemaRegistry.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    SchemaRegistry.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(logger: Logger): SchemaRegistry {
    return new SchemaRegistry(logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register a schema
   */
  register(name: string, schema: z.ZodType<unknown>): void {
    if (this.schemas.has(name)) {
      this.logger.warn(`Schema '${name}' already registered. Overwriting.`);
    }

    this.schemas.set(name, schema);
    this.logger.debug(`Registered schema: ${name}`);
  }

  /**
   * Get a schema by name
   */
  get<T = unknown>(name: string): z.ZodType<T> | undefined {
    const schema = this.schemas.get(name) as z.ZodType<T> | undefined;

    if (!schema) {
      this.logger.debug(`Schema '${name}' not found`);
    }

    return schema;
  }

  /**
   * Check if a schema exists
   */
  has(name: string): boolean {
    return this.schemas.has(name);
  }

  /**
   * Remove a schema
   */
  remove(name: string): boolean {
    const deleted = this.schemas.delete(name);

    if (deleted) {
      this.logger.debug(`Removed schema: ${name}`);
    } else {
      this.logger.debug(`Schema '${name}' not found for removal`);
    }

    return deleted;
  }

  /**
   * Get all schema names
   */
  getSchemaNames(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Get all schema names (alias for getSchemaNames)
   */
  getAllSchemaNames(): string[] {
    return this.getSchemaNames();
  }

  /**
   * Validate data against a schema
   */
  validate<T = unknown>(
    name: string,
    data: unknown,
  ): { success: true; data: T } | { success: false; error: z.ZodError } {
    const schema = this.get<T>(name);

    if (!schema) {
      throw new Error(`Schema '${name}' not found`);
    }

    try {
      const parsed = schema.parse(data);
      return { success: true, data: parsed };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error };
      }
      throw error;
    }
  }

  /**
   * Clear all schemas
   */
  clear(): void {
    this.schemas.clear();
    this.logger.debug("Cleared all schemas");
  }
}
