import type { z } from "zod";
import type { Logger } from "@brains/utils";
import type {
  BaseEntity,
  EntityAdapter,
  EntityRegistry as IEntityRegistry,
} from "./types";

/**
 * Registry for entity types
 * Implements Component Interface Standardization pattern
 */
export class EntityRegistry implements IEntityRegistry {
  private static instance: EntityRegistry | null = null;

  private entitySchemas = new Map<string, z.ZodType<unknown>>();
  private entityAdapters = new Map<string, EntityAdapter<BaseEntity>>();
  private logger: Logger;

  /**
   * Get the singleton instance of EntityRegistry
   */
  public static getInstance(logger: Logger): EntityRegistry {
    EntityRegistry.instance ??= new EntityRegistry(logger);
    return EntityRegistry.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    EntityRegistry.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(logger: Logger): EntityRegistry {
    return new EntityRegistry(logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register a new entity type with its schema and adapter
   */
  registerEntityType<TEntity extends BaseEntity>(
    type: string,
    schema: z.ZodType<unknown>,
    adapter: EntityAdapter<TEntity>,
  ): void {
    this.logger.info(`Registering entity type: ${type}`);

    // Check for duplicate registration
    if (this.entitySchemas.has(type)) {
      throw new Error(
        `Entity type registration failed for ${type}: Entity type is already registered`,
      );
    }

    // Schema validation handled by Zod - works correctly with extended schemas

    // Register schema and adapter
    this.entitySchemas.set(type, schema);
    this.entityAdapters.set(type, adapter);

    this.logger.info(`Registered entity type: ${type}`);
  }

  /**
   * Get schema for a specific entity type
   */
  getSchema(type: string): z.ZodType<unknown> {
    const schema = this.entitySchemas.get(type);
    if (!schema) {
      throw new Error(
        `Entity type registration failed for ${type}: No schema registered for entity type`,
      );
    }
    return schema;
  }

  /**
   * Get adapter for a specific entity type
   */
  getAdapter<T extends BaseEntity>(type: string): EntityAdapter<T> {
    const adapter = this.entityAdapters.get(type);
    if (!adapter) {
      throw new Error(
        `Entity type registration failed for ${type}: No adapter registered for entity type`,
      );
    }
    return adapter as EntityAdapter<T>;
  }

  /**
   * Check if an entity type is registered
   */
  hasEntityType(type: string): boolean {
    return this.entitySchemas.has(type) && this.entityAdapters.has(type);
  }

  /**
   * Validate entity against its schema
   */
  validateEntity<TData = unknown>(type: string, entity: unknown): TData {
    const schema = this.getSchema(type);
    return schema.parse(entity) as TData;
  }

  /**
   * Get all registered entity types
   */
  getAllEntityTypes(): string[] {
    return Array.from(this.entitySchemas.keys());
  }
}
