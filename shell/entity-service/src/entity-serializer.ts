import { getErrorMessage } from "@brains/utils/error";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import { isPlainRecord } from "@brains/utils/predicates";
import type { BaseEntity, EntityRegistry, SourceReadOption } from "./types";
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
   * Serialize an entity to markdown format. `stored` is the markdown the
   * entity replaces, given when the update carries a declared type's body
   * alone: the authored frontmatter the type does not write is kept from it.
   */
  public serializeEntity(entity: BaseEntity, stored?: string): string {
    const adapter = this.entityRegistry.getAdapter(entity.entityType);
    const serialized = applyVisibilityToMarkdown(
      adapter.toMarkdown(entity),
      entity.visibility,
    );
    return preserveSourceFrontmatter(
      stored === undefined
        ? entity.content
        : unwrittenSource(stored, serialized),
      serialized,
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
    source?: SourceReadOption,
  ): Promise<BaseEntity | null> {
    try {
      return this.reconstructEntity(entityData, source);
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
    source?: SourceReadOption,
  ): Promise<BaseEntity[]> {
    const entityList: BaseEntity[] = [];

    for (const entityData of rows) {
      try {
        entityList.push(this.reconstructEntity(entityData, source));
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
  public reconstructEntity(
    entityData: EntityData,
    source?: SourceReadOption,
  ): BaseEntity {
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

    const parsed = adapter.schema.parse(entity);
    // A declared type reads back its decoded body; its source is the stored
    // markdown. Every other type's content is the stored markdown already.
    return source === true && adapter.metadataFromFrontmatter === true
      ? { ...parsed, content: entityData.content }
      : parsed;
  }

  /**
   * Prepare entity for database storage
   */
  public prepareEntityForStorage(
    entity: BaseEntity,
    entityType: string,
    stored?: string,
  ): {
    markdown: string;
    metadata: Record<string, unknown>;
  } {
    // Get adapter for the entity type
    const adapter = this.entityRegistry.getAdapter(entityType);

    // Convert to markdown using adapter
    const markdown = this.serializeEntity(entity, stored);

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
   * Whether an update has to keep authored frontmatter from the stored
   * record: a declared type's reads hand back its body alone, so a writer
   * that sends the body back has not seen that frontmatter, and leaving it
   * out removes nothing. A writer that sends frontmatter sends the whole
   * document, as a file import or an editor does.
   */
  public keepsStoredFrontmatter(entity: BaseEntity): boolean {
    if (
      this.entityRegistry.getAdapter(entity.entityType)
        .metadataFromFrontmatter !== true
    ) {
      return false;
    }
    const written = readMarkdownFrontmatter(entity.content);
    return (
      !isPlainRecord(written.data) || Object.keys(written.data).length === 0
    );
  }

  /**
   * An update to a type whose metadata is its frontmatter, with the
   * frontmatter it writes carried into its metadata. Reads hand such a type
   * back its body alone, so frontmatter on an update is one the caller
   * wrote: it is laid over the metadata the caller read and decoded through
   * the type's adapter, so the stored metadata matches the stored
   * frontmatter at once rather than at the next import.
   */
  public withFrontmatterWrites<T extends BaseEntity>(entity: T): T {
    const adapter = this.entityRegistry.getAdapter(entity.entityType);
    if (adapter.metadataFromFrontmatter !== true) return entity;
    const written = readMarkdownFrontmatter(entity.content);
    if (!isPlainRecord(written.data)) return entity;
    if (Object.keys(written.data).length === 0) return entity;
    const encoded = readMarkdownFrontmatter(
      adapter.toMarkdown({ ...entity, content: written.content }),
    );
    let decoded: Partial<BaseEntity>;
    try {
      decoded = adapter.fromMarkdown(
        generateMarkdown(
          {
            ...(isPlainRecord(encoded.data) ? encoded.data : {}),
            ...written.data,
          },
          written.content,
        ),
      );
    } catch (error) {
      throw toEntityValidationError(entity.entityType, error) ?? error;
    }
    return {
      ...entity,
      metadata: this.stripPolicyMetadata(
        decoded.metadata ?? entity.metadata,
        entity.entityType,
      ),
    };
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

/**
 * The stored frontmatter a serialized document does not write, as a source
 * for preserving it: what the type writes comes from the entity, never the
 * stored copy.
 */
function unwrittenSource(stored: string, serialized: string): string {
  const storedFields = readMarkdownFrontmatter(stored).data;
  const written = readMarkdownFrontmatter(serialized).data;
  if (!isPlainRecord(storedFields)) return "";
  const kept = Object.fromEntries(
    Object.entries(storedFields).filter(
      ([key]) => !isPlainRecord(written) || !Object.hasOwn(written, key),
    ),
  );
  return Object.keys(kept).length > 0 ? generateMarkdown(kept, "") : "";
}
