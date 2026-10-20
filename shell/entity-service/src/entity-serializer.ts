import { getErrorMessage } from "@brains/utils/error";
import type { BaseEntity, EntityRegistry } from "./types";
import {
  applyVisibilityToMarkdown,
  extractVisibilityFromMarkdown,
} from "./frontmatter";
import type { Logger } from "@brains/utils/logger";
import type { EntityData } from "./entity-data";
import { toEntityValidationError } from "./errors";
import {
  dropFields,
  preserveSourceFrontmatter,
  unwrittenFields,
  withoutFrontmatterFields,
} from "./frontmatter-extensions";

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
    return preserveSourceFrontmatter(
      entity.content,
      applyVisibilityToMarkdown(adapter.toMarkdown(entity), entity.visibility),
      this.entityRegistry.getEntityTypeConfig(entity.entityType)
        .binaryStorage === "asset"
        ? undefined
        : adapter.frontmatterSchema,
      this.entityRegistry.getFrontmatterExtensions(entity.entityType),
      this.entityRegistry
        .getGroupings()
        .filter((grouping) => grouping.types.includes(entity.entityType))
        .map((grouping) => grouping.field),
      unwrittenFields(
        this.entityRegistry.getEntityTypeConfig(entity.entityType),
      ),
    );
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
    const current = withoutFrontmatterFields(
      markdown,
      this.retiredFields(entityType),
    );
    let parsedFromMarkdown: Partial<BaseEntity>;
    try {
      parsedFromMarkdown = adapter.fromMarkdown(current);
    } catch (error) {
      throw toEntityValidationError(entityType, error) ?? error;
    }
    const {
      metadata: parsedMetadata,
      visibility: _parsedVisibility,
      ...parsed
    } = parsedFromMarkdown;
    // Left unset when the file declares no visibility, so callers can tell
    // "the file said nothing" from "the file said public".
    const visibility = extractVisibilityFromMarkdown(markdown);
    const metadata = this.stripPolicyMetadata(
      this.entityRegistry.projectMetadata(
        entityType,
        current,
        parsedMetadata ?? {},
      ),
      entityType,
    );
    return {
      ...parsed,
      ...(visibility && { visibility }),
      metadata,
    };
  }

  /**
   * Convert a database row to a validated entity, or null if parsing/validation fails
   */
  public async convertToEntity(
    entityData: EntityData,
  ): Promise<BaseEntity | null> {
    try {
      return this.reconstructEntity(entityData);
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
  public async convertToEntities(
    rows: EntityData[],
    entityType: string,
  ): Promise<BaseEntity[]> {
    const entityList: BaseEntity[] = [];

    for (const entityData of rows) {
      try {
        entityList.push(this.reconstructEntity(entityData));
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
  public reconstructEntity(entityData: EntityData): BaseEntity {
    const adapter = this.entityRegistry.getAdapter(entityData.entityType);
    // Stored content keeps retired keys until rewritten; parse past them.
    const parsedContent = adapter.fromMarkdown(
      withoutFrontmatterFields(
        entityData.content,
        this.retiredFields(entityData.entityType),
      ),
    );
    // Strip parsed metadata — DB metadata is the source of truth.
    // `system_update({ operation: { kind: "fields" } })` mutates DB metadata without touching
    // markdown, so parsed frontmatter can be stale. Body-parsed top-level
    // fields (e.g. `about`, `skills`) still land via parsedRest.
    const {
      metadata: _parsedMeta,
      visibility: _parsedVisibility,
      ...parsedRest
    } = parsedContent;

    const entity: unknown = {
      id: entityData.id,
      entityType: entityData.entityType,
      content: entityData.content,
      contentHash: entityData.contentHash,
      created: new Date(entityData.created).toISOString(),
      updated: new Date(entityData.updated).toISOString(),
      visibility: entityData.visibility,
      ...parsedRest,
      ...this.stripPolicyMetadata(entityData.metadata, entityData.entityType),
      metadata: this.stripPolicyMetadata(
        entityData.metadata,
        entityData.entityType,
      ),
    };

    return adapter.schema.parse(entity);
  }

  /**
   * Prepare entity for database storage
   */
  public prepareEntityForStorage(
    entity: BaseEntity,
    entityType: string,
  ): {
    markdown: string;
    metadata: Record<string, unknown>;
  } {
    // Get adapter for the entity type
    const adapter = this.entityRegistry.getAdapter(entityType);

    // Convert to markdown using adapter
    const markdown = this.serializeEntity(entity);

    // Extract metadata using adapter, keeping visibility as a top-level field.
    const metadata = this.stripPolicyMetadata(
      this.entityRegistry.projectMetadata(
        entityType,
        markdown,
        adapter.extractMetadata(entity),
      ),
      entityType,
    );

    return { markdown, metadata };
  }

  /**
   * The entity with its type's retired fields left out of its content, so
   * validators and storage see only the fields the type still owns.
   */
  public withoutRetiredFields<
    T extends { entityType: string; content: string },
  >(entity: T): T {
    const content = withoutFrontmatterFields(
      entity.content,
      this.retiredFields(entity.entityType),
    );
    return content === entity.content ? entity : { ...entity, content };
  }

  /** Metadata without policy fields or the type's retired fields. */
  private stripPolicyMetadata(
    metadata: Record<string, unknown>,
    entityType: string,
  ): Record<string, unknown> {
    const { visibility: _visibility, ...rest } = metadata;
    const unwritten = unwrittenFields(
      this.entityRegistry.getEntityTypeConfig(entityType),
    );
    return dropFields(rest, unwritten) ?? rest;
  }

  private retiredFields(entityType: string): readonly string[] {
    return (
      this.entityRegistry.getEntityTypeConfig(entityType).retiredFields ?? []
    );
  }
}
