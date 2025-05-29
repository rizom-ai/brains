/**
 * Schema Registry for the Skeleton Application
 *
 * Manages Zod schemas for structured responses and entity validation.
 * Provides a centralized registry for schema access across the application.
 */
import { z } from "zod";
import { Logger } from "../../utils/logger";

/**
 * SchemaRegistry implementation
 *
 * Manages registration and retrieval of Zod schemas
 */
export class SchemaRegistry {
  private schemas: Map<string, z.ZodType<any>> = new Map();
  private logger: Logger = Logger.getInstance();

  /**
   * Register a schema
   *
   * @param name Schema identifier
   * @param schema Zod schema to register
   * @throws Error if schema with the same name already exists
   */
  register(name: string, schema: z.ZodType<any>): void {
    if (this.schemas.has(name)) {
      this.logger.warn(`Schema '${name}' already registered. Overwriting.`);
    }

    this.schemas.set(name, schema);
    this.logger.debug(`Registered schema: ${name}`);
  }

  /**
   * Get a schema by name
   *
   * @param name Schema identifier
   * @returns The schema or undefined if not found
   */
  get<T = any>(name: string): z.ZodType<T> | undefined {
    const schema = this.schemas.get(name) as z.ZodType<T> | undefined;

    if (!schema) {
      this.logger.debug(`Schema '${name}' not found`);
    }

    return schema;
  }

  /**
   * Check if a schema exists
   *
   * @param name Schema identifier
   * @returns True if the schema exists
   */
  has(name: string): boolean {
    return this.schemas.has(name);
  }

  /**
   * Remove a schema
   *
   * @param name Schema identifier
   * @returns True if the schema was removed
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
   *
   * @returns Array of schema names
   */
  getSchemaNames(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Validate data against a schema
   *
   * @param name Schema identifier
   * @param data Data to validate
   * @returns Validation result with parsed data or error
   */
  validate<T = any>(
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
