import { isDeepStrictEqual } from "node:util";
import { diffArrays } from "diff";
import {
  generateMarkdown,
  parseMarkdown,
  updateFrontmatterField,
} from "@brains/utils/markdown-frontmatter";
import {
  contentVisibilitySchema,
  extractVisibilityFromMarkdown,
  getPublishBoundaryState,
} from "@brains/entity-service";
import type { BaseEntity } from "@brains/entity-service";
import { setCoverImageId, setOgImageId } from "@brains/image";
import { z } from "@brains/utils/zod";
import { getErrorMessage } from "@brains/utils/error";
import type { SystemServices } from "./types";
import { FRONTMATTER_BLOCK } from "./markdown-body";
import type { UpdateOperationInput } from "./schemas";

/**
 * What an update asks for once edits are applied and a source is resolved: a
 * full content replacement or a set of field changes, never both.
 */
export type UpdateOperation =
  | {
      kind: "fields";
      fields: NonNullable<UpdateOperationInput["fields"]>;
    }
  | { kind: "content"; content: string };

/**
 * Changed lines a replacement preview still lists. Beyond it the preview says
 * the content is replaced wholesale. A count of edits, not a clock, so the
 * same replacement previews the same way on a loaded machine; and a small
 * one, because the diff's work grows with the document's length times this
 * bound (two unrelated 3000-line documents took 8 s to reach 4000 on a CI
 * runner), and a preview of more changed lines than this is not read anyway.
 */
const MAX_PREVIEW_DIFF_EDITS = 400;

interface UpdateError {
  success: false;
  error: string;
}

/**
 * Whether a store holds what an update asked for: an equal value, or for a
 * requested null, no key at all.
 */
export function fieldPersists(
  store: Record<string, unknown>,
  key: string,
  requested: unknown,
): boolean {
  if (requested === null) return !Object.hasOwn(store, key);
  return Object.hasOwn(store, key) && isDeepStrictEqual(store[key], requested);
}

export function sourceFieldKeys(
  entityType: string,
  registry: SystemServices["entityRegistry"],
): Set<string> {
  return new Set([
    ...registry
      .getFrontmatterExtensions(entityType)
      .flatMap((schema) => Object.keys(schema.shape)),
    ...registry
      .getGroupings()
      .filter((grouping) => grouping.types.includes(entityType))
      .map((grouping) => grouping.field),
  ]);
}

function currentFieldValue(
  entity: BaseEntity,
  key: string,
  sourceFields: ReadonlySet<string>,
): unknown {
  if (sourceFields.has(key))
    return parseMarkdown(entity.content).frontmatter[key];
  return key === "visibility" ? entity.visibility : entity.metadata[key];
}

/**
 * A declared type's entity, with the stored frontmatter its own fields do
 * not cover laid over its body, so a field update to a grouping or other
 * frontmatter extension sees the value stored and keeps every other field
 * the document carries. Its reads hand back its body alone, and those
 * fields live only in the stored document; an entity plugin class's
 * content is the stored document already.
 */
export function withStoredSourceFields(
  entity: BaseEntity,
  stored: string,
  registry: SystemServices["entityRegistry"],
): BaseEntity {
  // The type's own fields come from its metadata; the source fields
  // (groupings and extensions), and fields no one claims, from the file.
  const sourceFields = sourceFieldKeys(entity.entityType, registry);
  const owned = new Set(
    Object.keys(
      registry.getAdapter(entity.entityType).frontmatterSchema?.shape ?? {},
    ).filter((key) => !sourceFields.has(key)),
  );
  const kept = Object.fromEntries(
    Object.entries(parseMarkdown(stored).frontmatter).filter(
      ([key]) => !owned.has(key),
    ),
  );
  return Object.keys(kept).length > 0
    ? { ...entity, content: generateMarkdown(kept, entity.content) }
    : entity;
}

export function applyFieldUpdates(
  entity: BaseEntity,
  fields: Record<string, unknown>,
  registry: SystemServices["entityRegistry"],
): BaseEntity {
  const { visibility, coverImageId, ogImageId, ...metadataFields } = fields;
  const nextVisibility =
    visibility === undefined
      ? entity.visibility
      : contentVisibilitySchema.parse(visibility);

  const withCoverImage = Object.hasOwn(fields, "coverImageId")
    ? setCoverImageId(
        entity,
        typeof coverImageId === "string" ? coverImageId : null,
      )
    : entity;

  const withOgImage = Object.hasOwn(fields, "ogImageId")
    ? setOgImageId(
        withCoverImage,
        typeof ogImageId === "string" ? ogImageId : null,
      )
    : withCoverImage;

  const nextMetadata = { ...entity.metadata };
  for (const [key, value] of Object.entries(metadataFields)) {
    if (value === null) {
      delete nextMetadata[key];
    } else {
      nextMetadata[key] = value;
    }
  }

  const nextEntity: BaseEntity & Record<string, unknown> = {
    ...withOgImage,
    visibility: nextVisibility,
    metadata: nextMetadata,
  };

  // Keep metadata-backed top-level fields in sync before adapter serialization.
  // DB metadata is the source of truth on read, but adapters serialize from the
  // typed entity shape; without this, field updates can persist fresh metadata
  // beside stale frontmatter content.
  for (const [key, value] of Object.entries(metadataFields)) {
    if (value === null) {
      delete nextEntity[key];
    } else {
      nextEntity[key] = value;
    }
  }

  const sourceFields = sourceFieldKeys(entity.entityType, registry);
  let authored = false;
  for (const [key, value] of Object.entries(fields)) {
    if (!sourceFields.has(key)) continue;
    nextEntity.content = updateFrontmatterField(nextEntity.content, key, value);
    authored = true;
  }
  if (authored)
    nextEntity.metadata = registry.projectMetadata(
      entity.entityType,
      nextEntity.content,
      nextMetadata,
    );
  // Where metadata is the frontmatter, covers and social cards are metadata
  // too. Such a type is read back as its body alone, so a cleared one has no
  // frontmatter to be removed from; the metadata carries the change.
  if (registry.getAdapter(entity.entityType).metadataFromFrontmatter === true) {
    const metadata = { ...nextEntity.metadata };
    for (const key of ["coverImageId", "ogImageId"]) {
      if (!Object.hasOwn(fields, key)) continue;
      const value = fields[key];
      if (typeof value === "string") metadata[key] = value;
      else delete metadata[key];
    }
    nextEntity.metadata = metadata;
  }
  return nextEntity;
}

function applyContentUpdate(
  entity: BaseEntity,
  content: string,
  registry: SystemServices["entityRegistry"],
): BaseEntity {
  const adapter = registry.getAdapter(entity.entityType);
  const previous = adapter.fromMarkdown(entity.content);
  const parsed = adapter.fromMarkdown(content);
  const metadata = { ...entity.metadata };
  // Refresh changed source-derived values, but keep curated metadata when its
  // source did not change (for example a custom title during a body-only edit).
  for (const key of new Set([
    ...Object.keys(previous.metadata ?? {}),
    ...Object.keys(parsed.metadata ?? {}),
  ])) {
    const next = parsed.metadata?.[key];
    if (isDeepStrictEqual(previous.metadata?.[key], next)) continue;
    if (next === undefined) delete metadata[key];
    else metadata[key] = next;
  }
  return {
    ...entity,
    ...parsed,
    id: entity.id,
    entityType: entity.entityType,
    created: entity.created,
    updated: entity.updated,
    contentHash: entity.contentHash,
    content,
    metadata,
    visibility: extractVisibilityFromMarkdown(content) ?? entity.visibility,
  };
}

/**
 * Field keys that applyFieldUpdates handles outside entity metadata.
 */
const NON_METADATA_FIELD_KEYS = new Set([
  "visibility",
  "coverImageId",
  "ogImageId",
]);

const persistedFrontmatterSchema = z.record(z.string(), z.unknown());

/**
 * Fields-only updates change metadata and matching top-level fields, but each
 * adapter decides what reaches storage. A field survives when the adapter
 * extracts the requested metadata value or writes it to serialized
 * frontmatter. Adapters that rebuild both from unchanged content otherwise
 * produce a silent no-op.
 *
 * DB metadata is authoritative on read. A mismatched extracted value therefore
 * cannot be rescued by frontmatter, while a null update successfully deletes a
 * key that previously lived in metadata when extraction omits it. Fields that
 * never lived in metadata must disappear from serialized frontmatter instead.
 *
 * The probe is best-effort: an adapter that cannot answer leaves uncertain
 * updates alone rather than blocking them.
 */
function validateFieldUpdatePersistence(
  entity: BaseEntity,
  operation: UpdateOperation,
  entityRegistry: SystemServices["entityRegistry"],
  entityService: SystemServices["entityService"],
): UpdateError | undefined {
  if (operation.kind !== "fields") return undefined;
  const fields = operation.fields;

  const frontmatterSchema = entityRegistry.getEffectiveFrontmatterSchema(
    entity.entityType,
  );
  if (!frontmatterSchema) return undefined;

  const sourceFields = sourceFieldKeys(entity.entityType, entityRegistry);
  const authoredKeys = Object.keys(fields).filter((key) =>
    sourceFields.has(key),
  );
  let updated: BaseEntity;
  try {
    updated = applyFieldUpdates(entity, fields, entityRegistry);
    if (authoredKeys.length > 0) {
      const validated = entityRegistry.validateEntity(
        entity.entityType,
        updated,
      );
      const markdown = entityService.serializeEntity(validated);
      const source = parseMarkdown(markdown).frontmatter;
      const metadata =
        entityService.deserializeEntity(markdown, entity.entityType).metadata ??
        {};
      for (const key of authoredKeys) {
        const expected = fields[key];
        if (
          !fieldPersists(source, key, expected) ||
          !fieldPersists(metadata, key, expected)
        ) {
          return {
            success: false,
            error: `The requested ${key} value would not survive frontmatter persistence.`,
          };
        }
      }
    }
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error, "Invalid field update"),
    };
  }
  // Where covers and social cards are metadata (see applyFieldUpdates),
  // whether a write keeps them is settled the same way as any field.
  const imageFieldsAreMetadata =
    entityRegistry.getAdapter(entity.entityType).metadataFromFrontmatter ===
    true;
  const requested = Object.keys(fields).filter(
    (key) =>
      !sourceFields.has(key) &&
      (!NON_METADATA_FIELD_KEYS.has(key) ||
        (imageFieldsAreMetadata && key !== "visibility")) &&
      key in frontmatterSchema.shape,
  );
  if (requested.length === 0) return undefined;

  const adapter = entityRegistry.getAdapter(entity.entityType);
  let persistedMetadata: Record<string, unknown>;
  try {
    // Persistence validates before serialization. A root property the schema
    // strips must not make this best-effort probe promise a successful write.
    updated = entityRegistry.validateEntity(entity.entityType, updated);
    persistedMetadata = adapter.extractMetadata(updated);
  } catch {
    return undefined;
  }

  const dropped: string[] = [];
  const needsFrontmatterProbe: string[] = [];
  for (const key of requested) {
    const requestedValue = fields[key];
    // Extracted metadata answers for the keys it holds. A key it omits is
    // settled by serialized frontmatter, except a null deleting a key that
    // metadata held, which the omission already honours.
    if (Object.hasOwn(persistedMetadata, key)) {
      if (!fieldPersists(persistedMetadata, key, requestedValue))
        dropped.push(key);
    } else if (
      requestedValue !== null ||
      !Object.hasOwn(entity.metadata, key)
    ) {
      needsFrontmatterProbe.push(key);
    }
  }

  if (needsFrontmatterProbe.length > 0) {
    let persistedFrontmatter: Record<string, unknown> | undefined;
    try {
      persistedFrontmatter = adapter.parseFrontMatter(
        adapter.toMarkdown(updated),
        persistedFrontmatterSchema,
      );
    } catch {
      if (dropped.length === 0) return undefined;
    }

    if (persistedFrontmatter) {
      for (const key of needsFrontmatterProbe) {
        if (!fieldPersists(persistedFrontmatter, key, fields[key]))
          dropped.push(key);
      }
    }
  }

  if (dropped.length === 0) return undefined;

  return {
    success: false,
    error:
      `${entity.entityType} does not persist ${dropped.join(", ")} through 'fields'. ` +
      "The update would report success without changing anything. " +
      "Provide full markdown with frontmatter via 'content' instead.",
  };
}

/**
 * Turns replacement text into the full document it stands for. Text with its
 * own frontmatter replaces the whole document. Body-only text replaces the body
 * under the stored frontmatter, so metadata the caller never saw survives;
 * types without a body have nothing to replace and need full markdown. Blank
 * text stays blank, so empty-replacement validation still rejects it.
 */
export function resolveReplacementContent(
  entity: BaseEntity,
  text: string,
  registry: SystemServices["entityRegistry"],
): string | UpdateError {
  const storedFrontmatter = FRONTMATTER_BLOCK.exec(entity.content)?.[0];
  if (
    storedFrontmatter === undefined ||
    !text.trim() ||
    FRONTMATTER_BLOCK.test(text)
  )
    return text;
  if (registry.getAdapter(entity.entityType).hasBody === false)
    return {
      success: false,
      error: `${entity.entityType} has no body. Replace its full markdown, including frontmatter.`,
    };
  return storedFrontmatter + text;
}

function validateContentReplacement(
  entityType: string,
  operation: UpdateOperation,
  entityRegistry: SystemServices["entityRegistry"],
): UpdateError | undefined {
  if (operation.kind !== "content") return undefined;

  const trimmedContent = operation.content.trim();
  const frontmatterSchema =
    entityRegistry.getEffectiveFrontmatterSchema(entityType);
  if (!frontmatterSchema) return undefined;

  if (!trimmedContent) {
    return {
      success: false,
      error:
        "Full content replacement cannot be empty for this entity type. Use 'fields' for partial updates.",
    };
  }

  const adapter = entityRegistry.getAdapter(entityType);
  // A type whose metadata is decoded from its file derives some of it, such
  // as a social post's slug, which the file never states: a replacement with
  // frontmatter is checked as the file will be stored. Its content is the
  // body, so a body alone keeps the stored metadata.
  const decoded = adapter.metadataFromFrontmatter === true;
  if (decoded && !FRONTMATTER_BLOCK.test(operation.content)) return undefined;
  try {
    if (decoded) adapter.fromMarkdown(operation.content);
    else adapter.parseFrontMatter(operation.content, frontmatterSchema);
  } catch {
    // Only the replacement's own frontmatter is parsed here: a failure is
    // the caller's text not decoding, answered with what to send instead.
    return {
      success: false,
      error:
        "Invalid content replacement for this entity type. Provide full markdown with valid frontmatter, or use 'fields' for partial updates.",
    };
  }

  return undefined;
}

function validateCoverImageFieldUpdate(
  entityType: string,
  operation: UpdateOperation,
  entityRegistry: SystemServices["entityRegistry"],
): UpdateError | undefined {
  if (operation.kind !== "fields" || !("coverImageId" in operation.fields)) {
    return undefined;
  }

  const coverImageId = operation.fields["coverImageId"];
  if (
    coverImageId !== null &&
    coverImageId !== undefined &&
    typeof coverImageId !== "string"
  ) {
    return {
      success: false,
      error: "coverImageId must be a string or null",
    };
  }

  if (
    coverImageId === "__PENDING__" ||
    (typeof coverImageId === "string" && coverImageId.startsWith("upload-"))
  ) {
    return {
      success: false,
      error: "coverImageId must reference an existing image id or be null",
    };
  }

  const adapter = entityRegistry.getAdapter(entityType);
  if (adapter.supportsCoverImage) return undefined;
  return {
    success: false,
    error: `Entity type '${entityType}' doesn't support cover images`,
  };
}

function getUpdatedStatus(
  entity: BaseEntity,
  operation: UpdateOperation,
  entityRegistry: SystemServices["entityRegistry"],
): unknown {
  if (operation.kind === "fields" && "status" in operation.fields) {
    return operation.fields["status"];
  }

  if (operation.kind === "content") {
    const frontmatterSchema = entityRegistry.getEffectiveFrontmatterSchema(
      entity.entityType,
    );
    if (!frontmatterSchema) return entity.metadata["status"];
    try {
      return entityRegistry
        .getAdapter(entity.entityType)
        .parseFrontMatter(operation.content, frontmatterSchema)["status"];
    } catch {
      return entity.metadata["status"];
    }
  }

  return entity.metadata["status"];
}

export function buildUpdateDiff(
  entity: BaseEntity,
  operation: UpdateOperation,
  registry: SystemServices["entityRegistry"],
): string {
  const sourceFields = sourceFieldKeys(entity.entityType, registry);
  if (operation.kind === "fields") {
    return Object.entries(operation.fields)
      .map(([key, val]) => {
        const previous = currentFieldValue(entity, key, sourceFields);
        if (!sourceFields.has(key))
          return `${key}: ${String(previous ?? "(empty)")} → ${String(val)}`;
        const fieldSchema = registry.getEffectiveFrontmatterSchema(
          entity.entityType,
        )?.shape[key];
        const valid =
          fieldSchema !== undefined &&
          z.safeParse(fieldSchema, previous).success;
        const before =
          previous === undefined
            ? "(absent)"
            : `${JSON.stringify(previous)}${valid ? "" : " (invalid existing value)"}`;
        const after = val === null ? "(removed)" : JSON.stringify(val);
        return `${key}: ${before} → ${after}`;
      })
      .join("\n");
  }

  const oldLines = entity.content.split("\n");
  const newLines = operation.content.split("\n");
  // Align unchanged lines so insertions do not make the entire suffix look
  // rewritten. Bound diff work for large, completely different documents.
  const changes = diffArrays(oldLines, newLines, {
    maxEditLength: MAX_PREVIEW_DIFF_EDITS,
  });
  if (!changes) {
    return `Full content replacement (line diff omitted: more than ${MAX_PREVIEW_DIFF_EDITS} changed lines).`;
  }
  return changes
    .filter((change) => change.added || change.removed)
    .flatMap((change) =>
      change.value.map((line) => `${change.added ? "+" : "-"} ${line}`),
    )
    .join("\n");
}

/** The first reason this operation cannot be applied to the entity, if any. */
export function validateUpdateOperation(
  entity: BaseEntity,
  operation: UpdateOperation,
  entityRegistry: SystemServices["entityRegistry"],
  entityService: SystemServices["entityService"],
): UpdateError | undefined {
  return (
    validateFieldUpdatePersistence(
      entity,
      operation,
      entityRegistry,
      entityService,
    ) ??
    validateContentReplacement(entity.entityType, operation, entityRegistry) ??
    validateCoverImageFieldUpdate(entity.entityType, operation, entityRegistry)
  );
}

/** Crossing the publish boundary needs publish permission; anything else is an update. */
export function requiredUpdateAction(
  entity: BaseEntity,
  operation: UpdateOperation,
  entityRegistry: SystemServices["entityRegistry"],
): "update" | "publish" {
  const boundary = getPublishBoundaryState(
    entity.entityType,
    entity.metadata["status"],
    getUpdatedStatus(entity, operation, entityRegistry),
    entityRegistry,
  );
  return boundary === "non-publish" ? "update" : "publish";
}

/** The entity as it will be stored once the operation is applied. */
export function applyUpdateOperation(
  entity: BaseEntity,
  operation: UpdateOperation,
  entityRegistry: SystemServices["entityRegistry"],
): BaseEntity {
  return operation.kind === "content"
    ? applyContentUpdate(entity, operation.content, entityRegistry)
    : applyFieldUpdates(entity, operation.fields, entityRegistry);
}

const storedLinesShown = 5;
const storedLineLength = 160;

function clipStoredLine(line: string): string {
  return line.length > storedLineLength
    ? `${line.slice(0, storedLineLength)}…`
    : line;
}

function formatStoredValue(value: unknown): string {
  if (value === undefined) return "(removed)";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function nonBlank(line: string): boolean {
  return line.trim().length > 0;
}

/** Lines under a heading, quoted: the first few, then how many more. */
function quoteStored(heading: string, lines: string[]): string | undefined {
  if (lines.length === 0) return undefined;
  const hidden = lines.length - storedLinesShown;
  return [
    heading,
    ...lines
      .slice(0, storedLinesShown)
      .map((line) => `> ${clipStoredLine(line)}`),
    ...(hidden > 0 ? [`… and ${hidden} more changed lines`] : []),
  ].join("\n");
}

/** The metadata fields that moved, as storage now holds them. */
function changedFieldLines(before: BaseEntity, stored: BaseEntity): string[] {
  return [
    ...new Set([
      ...Object.keys(before.metadata),
      ...Object.keys(stored.metadata),
    ]),
  ]
    .filter(
      (key) => !isDeepStrictEqual(before.metadata[key], stored.metadata[key]),
    )
    .map((key) => `${key}: ${formatStoredValue(stored.metadata[key])}`);
}

/**
 * What storage holds after an update, read back once it was written: the
 * changed lines of the stored Markdown, the lines an edit removed, or
 * the changed fields when only metadata moved. Undefined when the read-back
 * shows no change.
 */
export function describeStoredChange(
  before: BaseEntity,
  stored: BaseEntity,
): string | undefined {
  if (stored.content === before.content)
    return quoteStored("Stored now:", changedFieldLines(before, stored));
  const parts = diffArrays(
    before.content.split("\n"),
    stored.content.split("\n"),
  );
  const added = parts
    .filter((part) => part.added)
    .flatMap((part) => part.value)
    .filter(nonBlank);
  if (added.length > 0) return quoteStored("Stored now:", added);
  return quoteStored(
    "No longer stored:",
    parts
      .filter((part) => part.removed)
      .flatMap((part) => part.value)
      .filter(nonBlank),
  );
}
