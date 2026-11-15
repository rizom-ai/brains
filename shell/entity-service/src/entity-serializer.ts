import { getErrorMessage } from "@brains/utils/error";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import { isPlainRecord } from "@brains/utils/predicates";
import type { BaseEntity, EntityRegistry, SourceReadOption } from "./types";
import {
  ENTITY_SYSTEM_FIELDS,
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
 * Whether two frontmatter values are the same, whatever their keys' order:
 * parsed YAML, so plain objects, arrays and scalars. The serializer runs in
 * browser bundles too, so it cannot reach node:util.
 */
function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameValue(item, right[index]))
    );
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        (key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]),
      )
    );
  }
  return Object.is(left, right);
}

/**
 * The written document's frontmatter in the order of the document it
 * replaces: each written key where that document has it, the document's
 * own value when it equals the written one (so a nested value keeps its
 * key order), and the keys the document lacks after the rest.
 */
const KEPT_RECORD_FIELDS: ReadonlySet<string> = new Set(
  ENTITY_SYSTEM_FIELDS.filter((field) => field !== "visibility"),
);

function inDocumentOrder(written: string, replaced: string): string {
  const source = readMarkdownFrontmatter(replaced).data;
  const target = readMarkdownFrontmatter(written);
  if (!isPlainRecord(source) || !isPlainRecord(target.data)) return written;
  // The record fields a file states stay where it states them, as an
  // entity plugin class's adapter wrote over existing frontmatter; the
  // serializer leaves them out of what it writes. Visibility is written
  // from the record itself. A date the file leaves unquoted is written
  // back as the quoted timestamp the class wrote.
  const fields = {
    ...Object.fromEntries(
      Object.entries(source)
        .filter(([key]) => KEPT_RECORD_FIELDS.has(key))
        .map(([key, value]) => [
          key,
          value instanceof Date ? value.toISOString() : value,
        ]),
    ),
    ...target.data,
  };
  const ordered = [
    ...Object.keys(source).filter((key) => Object.hasOwn(fields, key)),
    ...Object.keys(fields).filter((key) => !Object.hasOwn(source, key)),
  ];
  const result = Object.fromEntries(
    ordered.map((key) => [
      key,
      sameValue(source[key], fields[key]) ? source[key] : fields[key],
    ]),
  );
  return generateMarkdown(result, target.content);
}

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
    const written = preserveSourceFrontmatter(
      stored === undefined
        ? entity.content
        : unwrittenSource(stored, serialized),
      serialized,
      this.entityRegistry.getEntityTypeConfig(entity.entityType)
        .binaryStorage === "asset"
        ? undefined
        : (adapter.writtenFrontmatterSchema ?? adapter.frontmatterSchema),
      this.entityRegistry.getFrontmatterExtensions(entity.entityType),
      this.entityRegistry
        .getGroupings()
        .filter((grouping) => grouping.types.includes(entity.entityType))
        .map((grouping) => grouping.field),
      unwrittenFields(
        this.entityRegistry.getEntityTypeConfig(entity.entityType),
      ),
    );
    return adapter.writesInDocumentOrder === true
      ? inDocumentOrder(written, stored ?? entity.content)
      : written;
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
   * metadata, and adapter-parsed content, then validating against the schema.
   *
   * A type whose metadata is its frontmatter may hold rows an entity plugin
   * class stored, whose metadata the declaration no longer accepts until the
   * boot pass re-derives it. Such a row reads with the metadata re-derived
   * from its stored markdown, as the pass derives it; nothing is written. A
   * row whose markdown does not decode either fails as it would have.
   */
  public reconstructEntity(
    entityData: EntityData,
    source?: SourceReadOption,
  ): BaseEntity {
    try {
      return this.reconstructFromRow(entityData, source);
    } catch (error) {
      const derived = this.declaredMetadataFromMarkdown(entityData);
      if (!derived) throw error;
      return this.reconstructFromRow(
        { ...entityData, metadata: derived },
        source,
      );
    }
  }

  /**
   * A declared type's metadata as its stored markdown declares it, or
   * undefined for another type or markdown that does not decode.
   */
  private declaredMetadataFromMarkdown(
    entityData: EntityData,
  ): Record<string, unknown> | undefined {
    const { entityType, content } = entityData;
    if (
      !this.entityRegistry.hasEntityType(entityType) ||
      this.entityRegistry.getAdapter(entityType).metadataFromFrontmatter !==
        true
    ) {
      return undefined;
    }
    try {
      return this.deserializeEntity(content, entityType).metadata ?? {};
    } catch {
      return undefined;
    }
  }

  private reconstructFromRow(
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
    // `system_update({ operation: { fields } })` mutates DB metadata without touching
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
