import { isDeepStrictEqual } from "node:util";
import { diffArrays } from "diff";
import {
  parseMarkdown,
  updateFrontmatterField,
} from "@brains/utils/markdown-frontmatter";
import {
  canWriteVisibility,
  contentVisibilitySchema,
  extractVisibilityFromMarkdown,
  getPublishBoundaryState,
  permissionToVisibilityScope,
  resolveEntityOrError,
} from "@brains/entity-service";
import type { BaseEntity } from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { setCoverImageId, setOgImageId } from "@brains/image";
import { z } from "@brains/utils/zod";
import { updateInputSchema } from "./schemas";
import { applyContentEdits } from "./content-edits";
import { assertEntityActionAllowed } from "./entity-action-policy";
import type { SystemServices } from "./types";
import {
  buildEntityMutationEventContext,
  createConfirmationGate,
  createSystemTool,
  getEntityDisplayLabel,
  humanizeEntityType,
  normalizeUpdateInput,
} from "./tool-helpers";
import { getErrorMessage } from "@brains/utils/error";

function sourceFieldKeys(
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

function applyFieldUpdates(
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
  normalizedInput: { fields?: Record<string, unknown>; content?: string },
  entityRegistry: SystemServices["entityRegistry"],
  entityService: SystemServices["entityService"],
): { success: false; error: string } | undefined {
  const fields = normalizedInput.fields;
  if (!fields) return undefined;

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
          expected === null
            ? Object.hasOwn(source, key) || Object.hasOwn(metadata, key)
            : !isDeepStrictEqual(source[key], expected) ||
              !isDeepStrictEqual(metadata[key], expected)
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
  const requested = Object.keys(fields).filter(
    (key) =>
      !sourceFields.has(key) &&
      !NON_METADATA_FIELD_KEYS.has(key) &&
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
    const hasPersistedMetadata = Object.hasOwn(persistedMetadata, key);

    if (requestedValue === null) {
      if (hasPersistedMetadata) {
        dropped.push(key);
      } else if (!Object.hasOwn(entity.metadata, key)) {
        needsFrontmatterProbe.push(key);
      }
      continue;
    }

    if (hasPersistedMetadata) {
      if (!isDeepStrictEqual(persistedMetadata[key], requestedValue)) {
        dropped.push(key);
      }
    } else {
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
        const requestedValue = fields[key];
        const hasPersistedFrontmatter = Object.hasOwn(
          persistedFrontmatter,
          key,
        );
        if (
          requestedValue === null
            ? hasPersistedFrontmatter
            : !hasPersistedFrontmatter ||
              !isDeepStrictEqual(persistedFrontmatter[key], requestedValue)
        ) {
          dropped.push(key);
        }
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

function validateContentReplacement(
  entityType: string,
  normalizedInput: { fields?: Record<string, unknown>; content?: string },
  entityRegistry: SystemServices["entityRegistry"],
): { success: false; error: string } | undefined {
  if (normalizedInput.content === undefined) return undefined;

  const trimmedContent = normalizedInput.content.trim();
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

  try {
    entityRegistry
      .getAdapter(entityType)
      .parseFrontMatter(normalizedInput.content, frontmatterSchema);
  } catch {
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
  normalizedInput: { fields?: Record<string, unknown> },
  entityRegistry: SystemServices["entityRegistry"],
): { success: false; error: string } | undefined {
  if (!normalizedInput.fields || !("coverImageId" in normalizedInput.fields)) {
    return undefined;
  }

  const coverImageId = normalizedInput.fields["coverImageId"];
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
  normalizedInput: { fields?: Record<string, unknown>; content?: string },
  entityRegistry: SystemServices["entityRegistry"],
): unknown {
  if (normalizedInput.fields && "status" in normalizedInput.fields) {
    return normalizedInput.fields["status"];
  }

  if (normalizedInput.content !== undefined) {
    const frontmatterSchema = entityRegistry.getEffectiveFrontmatterSchema(
      entity.entityType,
    );
    if (!frontmatterSchema) return entity.metadata["status"];
    try {
      return entityRegistry
        .getAdapter(entity.entityType)
        .parseFrontMatter(normalizedInput.content, frontmatterSchema)["status"];
    } catch {
      return entity.metadata["status"];
    }
  }

  return entity.metadata["status"];
}

function buildUpdateDiff(
  entity: BaseEntity,
  normalizedInput: { fields?: Record<string, unknown>; content?: string },
  registry: SystemServices["entityRegistry"],
): string {
  const sourceFields = sourceFieldKeys(entity.entityType, registry);
  if (normalizedInput.fields) {
    return Object.entries(normalizedInput.fields)
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
  const newLines = (normalizedInput.content ?? "").split("\n");
  // Align unchanged lines so insertions do not make the entire suffix look
  // rewritten. Bound diff work for large, completely different documents.
  const changes = diffArrays(oldLines, newLines, { timeout: 100 });
  if (!changes) {
    return "Full content replacement (line diff omitted: comparison exceeded its time limit).";
  }
  return changes
    .filter((change) => change.added || change.removed)
    .flatMap((change) =>
      change.value.map((line) => `${change.added ? "+" : "-"} ${line}`),
    )
    .join("\n");
}

export function createEntityUpdateTool(services: SystemServices): Tool {
  const { entityService, logger, entityRegistry } = services;
  const confirmationGate = createConfirmationGate({
    label: "update",
    requestNoun: "the update",
  });

  return createSystemTool(
    "update",
    "Update an entity's fields or content. For small content changes, fetch the entity and use edits with exact oldText/newText pairs instead of regenerating the whole document. Use only one of fields, content, or edits. Requires confirmation; call this tool without confirmed to request that confirmation instead of asking for plain-text approval. For direct requests that provide exact IDs to set an existing image as an entity cover, call this tool on the target entity with fields.coverImageId set to the image ID; do not stop after lookup.",
    updateInputSchema,
    async (input, context) => {
      const visibilityScope = permissionToVisibilityScope(
        context.userPermissionLevel,
      );
      const resolved = await resolveEntityOrError(
        entityService,
        input.entityType,
        input.id,
        logger,
        undefined,
        visibilityScope,
      );
      if (!resolved.ok) return { success: false, error: resolved.error };
      const { entity } = resolved;

      // Recover only an omitted operation. The stored proposal remains the
      // authority for fields, edits, visibility, and optimistic concurrency.
      let mangledApprovalReplay = false;
      if (
        input.confirmed &&
        input.confirmationToken &&
        input.edits === undefined &&
        input.fields === undefined &&
        !input.content?.trim()
      ) {
        const stored = updateInputSchema.safeParse(
          confirmationGate.takePending(input.confirmationToken),
        );
        if (
          !stored.success ||
          stored.data.entityType !== entity.entityType ||
          stored.data.id !== entity.id
        ) {
          return {
            success: false,
            error:
              "No pending update confirmation found for this entity. Please request the update again.",
          };
        }
        input = stored.data;
        mangledApprovalReplay = true;
      }

      if (
        input.edits !== undefined &&
        (input.content !== undefined || input.fields !== undefined)
      ) {
        return {
          success: false,
          error: "Provide only one of 'edits', 'content', or 'fields'.",
        };
      }
      if (
        input.confirmed &&
        input.contentHash &&
        entity.contentHash !== input.contentHash
      ) {
        return {
          success: false,
          error:
            "Entity was modified since you reviewed the changes. Please try again.",
        };
      }

      const normalizedInput =
        input.edits !== undefined
          ? { content: applyContentEdits(entity.content, input.edits) }
          : normalizeUpdateInput({
              ...(input.fields !== undefined ? { fields: input.fields } : {}),
              ...(input.content !== undefined
                ? { content: input.content }
                : {}),
            });

      if (
        normalizedInput.content !== undefined &&
        normalizedInput.fields !== undefined
      )
        return {
          success: false,
          error: "Provide either 'content' or 'fields', not both",
        };
      if (!normalizedInput.content && !normalizedInput.fields)
        return {
          success: false,
          error:
            "Provide 'content' (full replacement) or 'fields' (partial update)",
        };

      const fieldPersistenceError = validateFieldUpdatePersistence(
        entity,
        normalizedInput,
        entityRegistry,
        entityService,
      );
      if (fieldPersistenceError) return fieldPersistenceError;

      const contentReplacementError = validateContentReplacement(
        entity.entityType,
        normalizedInput,
        entityRegistry,
      );
      if (contentReplacementError) return contentReplacementError;

      const coverImageFieldError = validateCoverImageFieldUpdate(
        entity.entityType,
        normalizedInput,
        entityRegistry,
      );
      if (coverImageFieldError) return coverImageFieldError;

      const oldStatus = entity.metadata["status"];
      const newStatus = getUpdatedStatus(
        entity,
        normalizedInput,
        entityRegistry,
      );
      const publishBoundary = getPublishBoundaryState(
        entity.entityType,
        oldStatus,
        newStatus,
        entityRegistry,
      );
      const requiredAction =
        publishBoundary === "non-publish" ? "update" : "publish";
      const policyError = assertEntityActionAllowed(
        services,
        input.entityType,
        requiredAction,
        context,
      );
      if (policyError) return policyError;

      if (input.confirmed) {
        if (!mangledApprovalReplay) {
          const gateError = confirmationGate.validateConfirmed(
            input.confirmationToken,
            input,
          );
          if (gateError) return gateError;
        }
        const updated =
          normalizedInput.content !== undefined
            ? applyContentUpdate(
                entity,
                normalizedInput.content,
                entityRegistry,
              )
            : applyFieldUpdates(
                entity,
                normalizedInput.fields ?? {},
                entityRegistry,
              );

        if (
          updated.visibility !== entity.visibility &&
          !canWriteVisibility(context.userPermissionLevel, updated.visibility)
        ) {
          return {
            success: false,
            error: `Cannot set entity visibility to "${updated.visibility}" — caller permission "${context.userPermissionLevel ?? "public"}" is not allowed to write at that level.`,
          };
        }

        try {
          const eventContext = buildEntityMutationEventContext(context);
          const result = await entityService.updateEntity({
            entity: updated,
            options: {
              expectedContentHash: entity.contentHash,
              ...(eventContext ? { eventContext } : {}),
            },
          });
          if (result.skipReason === "content-conflict") {
            return {
              success: false,
              error:
                "Entity was modified before the update could be saved. Please request and confirm the update again.",
            };
          }
        } catch (error) {
          return {
            success: false,
            error: getErrorMessage(error, "Failed to update entity"),
          };
        }
        return { success: true, data: { updated: entity.id } };
      }

      const label = getEntityDisplayLabel(entity);
      const diff = buildUpdateDiff(entity, normalizedInput, entityRegistry);
      // Approval must replay the normalized operation, not the JSON content
      // that may have been interpreted as a field update.
      const {
        fields: _fields,
        content: _content,
        ...confirmationInput
      } = input;
      return {
        needsConfirmation: true,
        toolName: "system_update",
        summary: `Update "${label}"?`,
        completionSummary: `Updated ${humanizeEntityType(entity.entityType)}.`,
        preview: diff,
        args: confirmationGate.buildArgs((confirmationToken) => ({
          ...confirmationInput,
          ...(input.edits !== undefined
            ? { edits: input.edits }
            : normalizedInput),
          id: entity.id,
          confirmed: true,
          confirmationToken,
          contentHash: entity.contentHash,
        })),
      };
    },
    { visibility: "trusted", sideEffects: "writes" },
  );
}
