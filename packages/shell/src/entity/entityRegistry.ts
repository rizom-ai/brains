import type { z } from "zod";
import type { Logger } from "@brains/utils";
import type { BaseEntity, IContentModel } from "../types";

/**
 * Entity adapter interface
 * Using markdown as the universal format for entities
 */
export interface EntityAdapter<T extends BaseEntity & IContentModel> {
  // Convert from markdown to entity
  fromMarkdown(markdown: string, metadata?: Record<string, unknown>): T;

  // Extract metadata from entity for search/filtering
  extractMetadata(entity: T): Record<string, unknown>;

  // Parse frontmatter metadata from markdown
  parseFrontMatter(markdown: string): Record<string, unknown>;

  // Generate frontmatter for markdown
  generateFrontMatter(entity: T): string;
}

/**
 * Registry for entity types
 * Implements Component Interface Standardization pattern
 */
export class EntityRegistry {
  private static instance: EntityRegistry | null = null;

  private entitySchemas = new Map<string, z.ZodType<unknown>>();
  private entityAdapters = new Map<
    string,
    EntityAdapter<BaseEntity & IContentModel>
  >();
  private logger: Logger;

  /**
   * Get the singleton instance of EntityRegistry
   */
  public static getInstance(logger: Logger): EntityRegistry {
    if (!EntityRegistry.instance) {
      EntityRegistry.instance = new EntityRegistry(logger);
    }
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
  registerEntityType<TEntity extends BaseEntity & IContentModel>(
    type: string,
    schema: z.ZodType<unknown>,
    adapter: EntityAdapter<TEntity>,
  ): void {
    this.logger.info(`Registering entity type: ${type}`);

    // Check for duplicate registration
    if (this.entitySchemas.has(type)) {
      throw new Error(`Entity type '${type}' is already registered`);
    }

    // Validate that schema can parse - but skip validation for now
    // TODO: Implement proper schema validation that works with extended schemas

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
      throw new Error(`No schema registered for entity type: ${type}`);
    }
    return schema;
  }

  /**
   * Get adapter for a specific entity type
   */
  getAdapter<T extends BaseEntity & IContentModel>(
    type: string,
  ): EntityAdapter<T> {
    const adapter = this.entityAdapters.get(type);
    if (!adapter) {
      throw new Error(`No adapter registered for entity type: ${type}`);
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
   * Convert entity to markdown with frontmatter
   */
  entityToMarkdown<T extends BaseEntity & IContentModel>(entity: T): string {
    const adapter = this.getAdapter<T>(entity.entityType);

    // Generate frontmatter
    const frontMatter = adapter.generateFrontMatter(entity);

    // Get markdown content
    const content = entity.toMarkdown();

    // Combine frontmatter and content
    return `${frontMatter}\n\n${content}`;
  }

  /**
   * Create entity from markdown with frontmatter
   */
  markdownToEntity<T extends BaseEntity & IContentModel>(
    type: string,
    markdown: string,
  ): T {
    const adapter = this.getAdapter<T>(type);

    // Parse frontmatter
    const metadata = adapter.parseFrontMatter(markdown);

    // Create entity from markdown - adapter handles validation internally
    const entity = adapter.fromMarkdown(markdown, metadata);

    // The adapter should have already validated the entity structure
    // We just verify it conforms to our schema but preserve methods
    const schema = this.getSchema(type);
    schema.parse(entity); // Validate but don't use result to preserve methods

    // Return the full entity with methods intact
    return entity;
  }

  /**
   * Get all registered entity types
   */
  getAllEntityTypes(): string[] {
    return Array.from(this.entitySchemas.keys());
  }
}
