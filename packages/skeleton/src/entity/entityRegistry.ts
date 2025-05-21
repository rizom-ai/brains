import { z } from 'zod';
import { Logger } from '../utils/logger';
import { BaseEntity, IContentModel } from '../types';

/**
 * Entity adapter interface
 * Using markdown as the universal format for entities
 */
export interface EntityAdapter<T extends BaseEntity & IContentModel> {
  // Convert from markdown to entity
  fromMarkdown(markdown: string, metadata?: Record<string, any>): T;
  
  // Extract metadata from entity for search/filtering
  extractMetadata(entity: T): Record<string, any>;
  
  // Parse frontmatter metadata from markdown
  parseFrontMatter(markdown: string): Record<string, any>;
  
  // Generate frontmatter for markdown
  generateFrontMatter(entity: T): string;
}

/**
 * Registry for entity types
 * Implements Component Interface Standardization pattern
 */
export class EntityRegistry {
  private static instance: EntityRegistry | null = null;
  
  private entitySchemas = new Map<string, z.ZodType<any>>();
  private entityAdapters = new Map<string, EntityAdapter<any>>();
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
  registerEntityType<T extends BaseEntity & IContentModel>(
    type: string,
    schema: z.ZodType<T>,
    adapter: EntityAdapter<T>
  ): void {
    this.logger.info(`Registering entity type: ${type}`);
    
    // Validate that schema extends baseEntitySchema
    try {
      // Create a sample entity with required fields
      const sampleEntity = {
        id: '00000000-0000-0000-0000-000000000000',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        tags: [],
        entityType: type,
      };
      
      // Validate with the schema
      schema.parse(sampleEntity);
    } catch (error) {
      throw new Error(`Entity schema for ${type} must extend baseEntitySchema: ${error.message}`);
    }
    
    // Register schema and adapter
    this.entitySchemas.set(type, schema);
    this.entityAdapters.set(type, adapter);
    
    this.logger.info(`Registered entity type: ${type}`);
  }
  
  /**
   * Get schema for a specific entity type
   */
  getSchema<T extends BaseEntity & IContentModel>(type: string): z.ZodType<T> {
    const schema = this.entitySchemas.get(type);
    if (!schema) {
      throw new Error(`No schema registered for entity type: ${type}`);
    }
    return schema as z.ZodType<T>;
  }
  
  /**
   * Get adapter for a specific entity type
   */
  getAdapter<T extends BaseEntity & IContentModel>(type: string): EntityAdapter<T> {
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
  validateEntity<T extends BaseEntity & IContentModel>(type: string, entity: unknown): T {
    const schema = this.getSchema<T>(type);
    return schema.parse(entity);
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
    markdown: string
  ): T {
    const adapter = this.getAdapter<T>(type);
    
    // Parse frontmatter
    const metadata = adapter.parseFrontMatter(markdown);
    
    // Create entity from markdown
    const entity = adapter.fromMarkdown(markdown, metadata);
    
    // Validate entity
    return this.validateEntity<T>(type, entity);
  }
  
  /**
   * Get all registered entity types
   */
  getAllEntityTypes(): string[] {
    return Array.from(this.entitySchemas.keys());
  }
}