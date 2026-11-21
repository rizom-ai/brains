import { getErrorMessage } from "@brains/utils/error";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import { isPlainRecord } from "@brains/utils/predicates";
import { z } from "@brains/utils/zod";
import type { BaseEntity, EntityRegistry, SourceReadOption } from "./types";
import { storedFormWrites, type StoredForm } from "./stored-form";
import {
  ENTITY_SYSTEM_FIELDS,
  applyVisibilityToMarkdown,
  extractVisibilityFromMarkdown,
} from "./frontmatter";
import type { Logger } from "@brains/utils/logger";
import type { EntityData } from "./entity-data";
import { toEntityValidationError } from "./errors";
import { stableJson } from "./entity-revision";
import {
  dropFields,
  objectShapeOf,
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
// The record's dates a file states stay in it; its identity, content and
// hash are the record's own and never come from a file.
const KEPT_RECORD_FIELDS: ReadonlySet<string> = new Set(["created", "updated"]);

/** A record date a file states: a parsed date, or text that reads as one. */
function isStatedDate(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}/u.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/** The header block of a document as written, or none. */
function headerText(markdown: string): string | undefined {
  return HEADER.exec(markdown)?.[0].replace(/\n$/u, "");
}

function inDocumentOrder(written: string, replaced: string): string {
  // A header the write leaves as the document it replaces states it is
  // kept byte for byte: its author's YAML style is not redrawn.
  const writtenHeader = headerText(written);
  if (writtenHeader !== undefined && writtenHeader === headerText(replaced))
    return written;
  const source = headerOf(replaced);
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
        // A forged or malformed date is not the record's; it is not kept.
        .filter(
          ([key, value]) => KEPT_RECORD_FIELDS.has(key) && isStatedDate(value),
        )
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

/** A document's header, or none when it has none or it does not parse. */
function headerOf(markdown: string): Record<string, unknown> | undefined {
  try {
    const { data } = readMarkdownFrontmatter(markdown);
    return isPlainRecord(data) ? data : undefined;
  } catch {
    // A stored header kept for an editor to repair states nothing a write
    // can keep: the write is ordered and stated as the type declares it.
    return undefined;
  }
}

/** The value a schema supplies for a key a document leaves out, if any. */
function schemaDefault(schema: unknown): { value: unknown } | undefined {
  if (!(schema instanceof z.ZodType)) return undefined;
  const result = schema.safeParse(undefined);
  return result.success && result.data !== undefined
    ? { value: result.data }
    : undefined;
}

/**
 * The written document without a key the document it replaces does not
 * state and whose value is the one the schema supplies: a file states only
 * what its author stated. Metadata keeps the default, so readers see it
 * whether or not the file says so.
 */
function withoutUnstatedDefaults(
  written: string,
  replaced: string,
  schema: z.ZodObject<z.ZodRawShape> | undefined,
): string {
  if (!schema) return written;
  const document = readMarkdownFrontmatter(written);
  if (!isPlainRecord(document.data)) return written;
  const source = headerOf(replaced) ?? {};
  const fields = Object.entries(document.data);
  const kept = fields.filter(([key, value]) => {
    if (key === "visibility" || Object.hasOwn(source, key)) return true;
    const supplied = schemaDefault(schema.shape[key]);
    return !supplied || !sameValue(supplied.value, value);
  });
  if (kept.length === fields.length) return written;
  return kept.length > 0
    ? generateMarkdown(Object.fromEntries(kept), document.content)
    : document.content;
}

const HEADER = /^---[^\n]*\n(?:[\s\S]*?\n)?---(?:\n|$)/u;

/**
 * A text document framed the one way every path writes it: the header,
 * then the body with no blank line above it and one newline at its end. A
 * document without a body is its header and one empty line.
 */
export function framedDocument(markdown: string): string {
  const header = HEADER.exec(markdown)?.[0];
  const rest = header === undefined ? markdown : markdown.slice(header.length);
  const body = rest.replace(/^(?:[ \t]*\n)+/u, "").trimEnd();
  if (header === undefined) return body.length > 0 ? `${body}\n` : "";
  const closed = header.endsWith("\n") ? header : `${header}\n`;
  return body.length > 0 ? `${closed}${body}\n` : `${closed}\n`;
}

/**
 * EntitySerializer handles conversion between entities and markdown
 * Extracted from EntityService for single responsibility
 */
export class EntitySerializer {
  private entityRegistry: EntityRegistry;
  private logger: Logger;
  /** The stored form this serializer writes. */
  public readonly storedForm: StoredForm;

  constructor(
    entityRegistry: EntityRegistry,
    logger: Logger,
    storedForm: StoredForm = storedFormWrites,
  ) {
    this.entityRegistry = entityRegistry;
    this.logger = logger.child("EntitySerializer");
    this.storedForm = storedForm;
  }

  /**
   * Serialize an entity to markdown format. `stored` is the markdown the
   * entity replaces, given when the update carries a declared type's body
   * alone: the authored frontmatter the type does not write is kept from it.
   */
  public serializeEntity(entity: BaseEntity, stored?: string): string {
    const adapter = this.entityRegistry.getAdapter(entity.entityType);
    const assetBacked =
      this.entityRegistry.getEntityTypeConfig(entity.entityType)
        .binaryStorage === "asset";
    // An asset-backed row stores the bare reference; visibility lives on the row.
    const markdown = adapter.toMarkdown(entity, { form: this.storedForm });
    const serialized = assetBacked
      ? markdown
      : applyVisibilityToMarkdown(markdown, entity.visibility);
    const written = preserveSourceFrontmatter(
      stored === undefined
        ? entity.content
        : unwrittenSource(stored, serialized),
      serialized,
      assetBacked
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
    // Bytes keep the form they were handed; text takes the stored form.
    if (
      this.entityRegistry.getEntityTypeConfig(entity.entityType)
        .binaryStorage !== undefined
    ) {
      return written;
    }
    const replaced = stored ?? entity.content;
    const ordered = inDocumentOrder(written, replaced);
    return framedDocument(
      adapter.metadataFromFrontmatter === true
        ? withoutUnstatedDefaults(ordered, replaced, adapter.frontmatterSchema)
        : ordered,
    );
  }

  /**
   * The header keys a document holds that its type does not name, at the
   * top level or one level inside an object the type owns, as `parent.key`:
   * kept as written, and reported by whoever wrote them.
   */
  public unknownFrontmatterKeys(
    markdown: string,
    entityType: string,
  ): string[] {
    const adapter = this.entityRegistry.getAdapter(entityType);
    const config = this.entityRegistry.getEntityTypeConfig(entityType);
    const schemas = [
      adapter.frontmatterSchema,
      adapter.writtenFrontmatterSchema,
    ].filter((schema) => schema !== undefined);
    const header = headerOf(markdown);
    if (config.binaryStorage !== undefined || schemas.length === 0 || !header)
      return [];
    const known = new Set([
      ...schemas.flatMap((schema) => Object.keys(schema.shape)),
      ...this.entityRegistry
        .getFrontmatterExtensions(entityType)
        .flatMap((schema) => Object.keys(schema.shape)),
      ...this.entityRegistry
        .getGroupings()
        .filter((grouping) => grouping.types.includes(entityType))
        .map((grouping) => grouping.field),
      ...ENTITY_SYSTEM_FIELDS,
      ...unwrittenFields(config),
    ]);
    const unwritten = new Set(unwrittenFields(config));
    return Object.entries(header).flatMap(([key, value]) => {
      if (!known.has(key)) return [key];
      if (!isPlainRecord(value)) return [];
      const shapes = schemas
        .map((schema) => objectShapeOf(schema.shape[key]))
        .filter((shape) => shape !== undefined);
      if (shapes.length === 0) return [];
      return Object.keys(value)
        .filter(
          (nested) =>
            !shapes.some((shape) => Object.hasOwn(shape, nested)) &&
            !unwritten.has(`${key}.${nested}`),
        )
        .map((nested) => `${key}.${nested}`);
    });
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
   * Whether an update carries frontmatter for a type whose metadata is its
   * frontmatter: what it writes there is told from what a read handed back
   * against the stored document.
   */
  public carriesFrontmatter(entity: BaseEntity): boolean {
    return (
      this.entityRegistry.getAdapter(entity.entityType)
        .metadataFromFrontmatter === true &&
      !this.keepsStoredFrontmatter(entity)
    );
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
   * frontmatter it writes carried into its metadata: it is laid over the
   * metadata the caller read and decoded through the type's adapter, so the
   * stored metadata matches the stored frontmatter at once rather than at
   * the next import. Only the fields the caller wrote are laid over: a type
   * read as written hands back its header as stored, so a field update that
   * changes its metadata returns that header unchanged, and a header field
   * that still reads as `stored` holds is the read's, not a write.
   */
  public withFrontmatterWrites<T extends BaseEntity>(
    entity: T,
    stored?: string,
  ): T {
    const adapter = this.entityRegistry.getAdapter(entity.entityType);
    if (adapter.metadataFromFrontmatter !== true) return entity;
    const document = readMarkdownFrontmatter(entity.content);
    if (!isPlainRecord(document.data)) return entity;
    const written = writtenOver(document.data, stored);
    if (Object.keys(written).length === 0) return entity;
    const encoded = readMarkdownFrontmatter(
      adapter.toMarkdown(
        { ...entity, content: document.content },
        { form: this.storedForm },
      ),
    );
    let decoded: Partial<BaseEntity>;
    try {
      decoded = adapter.fromMarkdown(
        generateMarkdown(
          {
            // The header as handed in keeps the fields metadata does not
            // name; metadata states its own; the fields written win.
            ...document.data,
            ...(isPlainRecord(encoded.data) ? encoded.data : {}),
            ...written,
          },
          document.content,
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

/**
 * The header fields an update writes: each one whose value differs from the
 * header `stored` holds, or every field when there is no stored document.
 */
function writtenOver(
  header: Record<string, unknown>,
  stored: string | undefined,
): Record<string, unknown> {
  if (stored === undefined) return header;
  let storedHeader: unknown;
  try {
    storedHeader = readMarkdownFrontmatter(stored).data;
  } catch {
    // A stored header that does not parse, kept for an editor to repair,
    // holds nothing to tell a read from a write: every field is written.
    return header;
  }
  if (!isPlainRecord(storedHeader)) return header;
  return Object.fromEntries(
    Object.entries(header).filter(
      ([key, value]) =>
        !Object.hasOwn(storedHeader, key) ||
        stableJson(value) !== stableJson(storedHeader[key]),
    ),
  );
}
