import type { BaseEntity } from "./types";
import type { EntityRegistry } from "./entityRegistry";
import type { Logger } from "@brains/utils";

/**
 * EntitySerializer handles conversion between entities and markdown
 * Extracted from EntityService for single responsibility
 */
export class EntitySerializer {
  private entityRegistry: EntityRegistry;
  private logger: Logger;

  constructor(entityRegistry: EntityRegistry, logger: Logger) {
    this.entityRegistry = entityRegistry;
    this.logger = logger.child("EntitySerializer");
  }

  /**
   * Serialize an entity to markdown format
   */
  public serializeEntity(entity: BaseEntity): string {
    const adapter = this.entityRegistry.getAdapter(entity.entityType);
    return adapter.toMarkdown(entity);
  }

  /**
   * Deserialize markdown content to an entity (partial)
   * Returns parsed fields from markdown - caller should merge with metadata
   */
  public deserializeEntity(
    markdown: string,
    entityType: string,
  ): Partial<BaseEntity> {
    const adapter = this.entityRegistry.getAdapter(entityType);
    return adapter.fromMarkdown(markdown);
  }

  /**
   * Convert database row to entity with validation
   */
  public async convertToEntity<T extends BaseEntity>(entityData: {
    id: string;
    entityType: string;
    content: string;
    created: number;
    updated: number;
    metadata: Record<string, unknown>;
  }): Promise<T | null> {
    try {
      const adapter = this.entityRegistry.getAdapter<T>(entityData.entityType);

      // Extract entity-specific fields from markdown
      const parsedContent = adapter.fromMarkdown(entityData.content);

      // Merge database fields with parsed content and metadata
      const entity = {
        // Core fields from database (always authoritative)
        id: entityData.id,
        entityType: entityData.entityType,
        content: entityData.content,
        created: new Date(entityData.created).toISOString(),
        updated: new Date(entityData.updated).toISOString(),

        // Fields from metadata (includes title, tags, entity-specific fields)
        ...entityData.metadata,

        // Entity-specific fields from adapter (override metadata if needed)
        ...parsedContent,
      } as T;

      // Validate the complete entity
      return await this.entityRegistry.validateEntity(
        entityData.entityType,
        entity,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to parse entity of type ${entityData.entityType} with ID ${entityData.id}: ${errorMessage}`,
      );
      return null;
    }
  }

  /**
   * Convert multiple database rows to entities
   */
  public async convertToEntities<T extends BaseEntity>(
    rows: Array<{
      id: string;
      entityType: string;
      content: string;
      created: number;
      updated: number;
      metadata: Record<string, unknown>;
    }>,
    entityType: string,
  ): Promise<T[]> {
    const entityList: T[] = [];
    const adapter = this.entityRegistry.getAdapter<T>(entityType);

    for (const entityData of rows) {
      try {
        // Extract entity-specific fields from markdown
        const parsedContent = adapter.fromMarkdown(entityData.content);

        // Merge database fields with parsed content and metadata
        const entity = {
          // Core fields from database
          id: entityData.id,
          entityType: entityData.entityType,
          content: entityData.content,
          created: new Date(entityData.created).toISOString(),
          updated: new Date(entityData.updated).toISOString(),

          // Fields from metadata (includes title, tags, entity-specific fields)
          ...entityData.metadata,

          // Entity-specific fields from adapter (override metadata if needed)
          ...parsedContent,
        } as T;

        // Validate and add to list
        const validatedEntity = this.entityRegistry.validateEntity<T>(
          entityType,
          entity,
        );
        entityList.push(validatedEntity);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to parse entity of type ${entityType} with ID ${entityData.id}: ${errorMessage}`,
        );
        // Skip invalid entities and continue
      }
    }

    return entityList;
  }

  /**
   * Prepare entity for database storage
   */
  public prepareEntityForStorage<T extends BaseEntity>(
    entity: T,
    entityType: string,
  ): {
    markdown: string;
    metadata: Record<string, unknown>;
  } {
    // Get adapter for the entity type
    const adapter = this.entityRegistry.getAdapter<T>(entityType);

    // Convert to markdown using adapter
    const markdown = adapter.toMarkdown(entity);

    // Extract metadata using adapter
    const metadata = adapter.extractMetadata(entity);

    return { markdown, metadata };
  }
}
