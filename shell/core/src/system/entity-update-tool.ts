import { isDeepStrictEqual } from "node:util";
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

const pendingApprovalForEntitySchema = z.looseObject({
  entityType: z.literal("agent"),
  id: z.string(),
});

function currentFieldValue(entity: BaseEntity, key: string): unknown {
  return key === "visibility" ? entity.visibility : entity.metadata[key];
}

function applyFieldUpdates(
  entity: BaseEntity,
  fields: Record<string, unknown>,
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

  return nextEntity;
}

function validateAnchorProfileUpdate(
  entityType: string,
  normalizedInput: { fields?: Record<string, unknown>; content?: string },
): { success: false; error: string } | undefined {
  if (entityType !== "anchor-profile") return undefined;

  if (normalizedInput.fields) {
    return {
      success: false,
      error:
        "anchor-profile updates require full markdown content replacement, not fields-only updates.",
    };
  }

  return undefined;
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
): { success: false; error: string } | undefined {
  const fields = normalizedInput.fields;
  if (!fields) return undefined;

  const frontmatterSchema = entityRegistry.getEffectiveFrontmatterSchema(
    entity.entityType,
  );
  if (!frontmatterSchema) return undefined;

  const requested = Object.keys(fields).filter(
    (key) =>
      !NON_METADATA_FIELD_KEYS.has(key) && key in frontmatterSchema.shape,
  );
  if (requested.length === 0) return undefined;

  const adapter = entityRegistry.getAdapter(entity.entityType);
  const updated = applyFieldUpdates(entity, fields);
  let persistedMetadata: Record<string, unknown>;
  try {
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
): string {
  if (normalizedInput.fields) {
    return Object.entries(normalizedInput.fields)
      .map(
        ([key, val]) =>
          `${key}: ${String(currentFieldValue(entity, key) ?? "(empty)")} → ${String(val)}`,
      )
      .join("\n");
  }

  const oldLines = entity.content.split("\n");
  const newLines = (normalizedInput.content ?? "").split("\n");
  const diffLines: string[] = [];
  for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
    if ((oldLines[i] ?? "") !== (newLines[i] ?? "")) {
      if (oldLines[i]) diffLines.push(`- ${oldLines[i]}`);
      if (newLines[i]) diffLines.push(`+ ${newLines[i]}`);
    }
  }
  return diffLines.join("\n");
}

export function createEntityUpdateTool(services: SystemServices): Tool {
  const { entityService, logger, entityRegistry } = services;
  const confirmationGate = createConfirmationGate({
    label: "update",
    requestNoun: "the update",
  });

  return createSystemTool(
    "update",
    "Update an entity's fields or content. Requires confirmation; call this tool without confirmed to request that confirmation instead of asking for plain-text approval. For direct requests that provide exact IDs to set an existing image as an entity cover, call this tool on the target entity with fields.coverImageId set to the image ID; do not stop after lookup.",
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

      let normalizedInput = normalizeUpdateInput({
        ...(input.fields !== undefined ? { fields: input.fields } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
      });

      const isBlankContentApprovalAttempt =
        normalizedInput.content?.trim().length === 0 &&
        normalizedInput.fields === undefined;

      const agentStatus = entity.metadata["status"];
      let mangledApprovalReplay = false;
      if (
        input.confirmed &&
        entity.entityType === "agent" &&
        (agentStatus === "discovered" || agentStatus === "approved") &&
        ((!normalizedInput.content && !normalizedInput.fields) ||
          isBlankContentApprovalAttempt)
      ) {
        // Models are known to mangle the approval replay (dropping fields or
        // sending blank content — bc512ef59). Tolerate the mangling, but only
        // when the token proves a real pending proposal for this same agent;
        // a confirmed call fabricated from nothing must not grant trust.
        const stored = pendingApprovalForEntitySchema.safeParse(
          confirmationGate.takePending(input.confirmationToken),
        );
        if (!stored.success || stored.data.id !== entity.id) {
          return {
            success: false,
            error:
              "No pending update confirmation found for this agent. Please request the update again and confirm the new approval.",
          };
        }
        normalizedInput = {
          fields: { status: "approved" },
        };
        mangledApprovalReplay = true;
      }

      if (normalizedInput.content && normalizedInput.fields)
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

      const anchorProfileError = validateAnchorProfileUpdate(
        entity.entityType,
        normalizedInput,
      );
      if (anchorProfileError) return anchorProfileError;

      const fieldPersistenceError = validateFieldUpdatePersistence(
        entity,
        normalizedInput,
        entityRegistry,
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
        if (input.contentHash && entity.contentHash !== input.contentHash) {
          return {
            success: false,
            error:
              "Entity was modified since you reviewed the changes. Please try again.",
          };
        }

        const updated =
          normalizedInput.content !== undefined
            ? {
                ...entity,
                content: normalizedInput.content,
                // Replacement content that declares no visibility is not a
                // demotion request: export omits the key for public entities,
                // so regenerated or hand-edited content routinely arrives
                // without it. Keep the stored tier unless the file says
                // otherwise.
                visibility:
                  extractVisibilityFromMarkdown(normalizedInput.content) ??
                  entity.visibility,
              }
            : applyFieldUpdates(entity, normalizedInput.fields ?? {});

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
          await entityService.updateEntity({
            entity: updated,
            ...(eventContext ? { options: { eventContext } } : {}),
          });
        } catch (error) {
          return {
            success: false,
            error: getErrorMessage(error, "Failed to update entity"),
          };
        }
        return { success: true, data: { updated: entity.id } };
      }

      const label = getEntityDisplayLabel(entity);
      const diff = buildUpdateDiff(entity, normalizedInput);
      return {
        needsConfirmation: true,
        toolName: "system_update",
        summary: `Update "${label}"?`,
        completionSummary: `Updated ${humanizeEntityType(entity.entityType)}.`,
        preview: diff,
        args: confirmationGate.buildArgs((confirmationToken) => ({
          ...input,
          ...normalizedInput,
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
