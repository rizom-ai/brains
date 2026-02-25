import { getErrorMessage } from "@brains/utils";
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
   * Convert a database row to a validated entity, or null if parsing/validation fails
   */
  public async convertToEntity<T extends BaseEntity>(entityData: {
    id: string;
    entityType: string;
    content: string;
    contentHash: string;
    created: number;
    updated: number;
    metadata: Record<string, unknown>;
  }): Promise<T | null> {
    try {
      return this.reconstructEntity<T>(entityData);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(
        `Failed to parse entity of type ${entityData.entityType} with ID ${entityData.id}: ${errorMessage}`,
      );
      return null;
    }
  }

  /**
   * Convert multiple database rows to entities, skipping any that fail validation
   */
  public async convertToEntities<T extends BaseEntity>(
    rows: Array<{
      id: string;
      entityType: string;
      content: string;
      contentHash: string;
      created: number;
      updated: number;
      metadata: Record<string, unknown>;
    }>,
    entityType: string,
  ): Promise<T[]> {
    const entityList: T[] = [];

    for (const entityData of rows) {
      try {
        entityList.push(this.reconstructEntity<T>(entityData));
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        this.logger.error(
          `Failed to parse entity of type ${entityType} with ID ${entityData.id}: ${errorMessage}`,
        );
      }
    }

    return entityList;
  }

  /**
   * Reconstruct a typed entity from a database row by merging DB fields,
   * metadata, and adapter-parsed content, then validating against the schema
   */
  public reconstructEntity<T extends BaseEntity>(entityData: {
    id: string;
    entityType: string;
    content: string;
    contentHash: string;
    created: number;
    updated: number;
    metadata: Record<string, unknown>;
  }): T {
    const adapter = this.entityRegistry.getAdapter<T>(entityData.entityType);
    const parsedContent = adapter.fromMarkdown(entityData.content);

    const entity = {
      id: entityData.id,
      entityType: entityData.entityType,
      content: entityData.content,
      contentHash: entityData.contentHash,
      created: new Date(entityData.created).toISOString(),
      updated: new Date(entityData.updated).toISOString(),
      metadata: entityData.metadata,
      ...entityData.metadata,
      ...parsedContent,
    } as T;

    return this.entityRegistry.validateEntity<T>(entityData.entityType, entity);
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
