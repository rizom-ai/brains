import {
  canWriteVisibility,
  contentVisibilitySchema,
  extractVisibilityFromMarkdown,
  permissionToVisibilityScope,
  resolveEntityOrError,
} from "@brains/entity-service";
import type { BaseEntity } from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { setCoverImageId, setOgImageId } from "@brains/image";
import { updateInputSchema } from "./schemas";
import { assertEntityActionAllowed } from "./entity-action-policy";
import type { SystemServices } from "./types";
import {
  buildEntityMutationEventContext,
  createSystemTool,
  getEntityDisplayLabel,
  humanizeEntityType,
  normalizeUpdateInput,
} from "./tool-helpers";
import { getPublishBoundaryState } from "./entity-publish-policy";

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

  return {
    ...withOgImage,
    visibility: nextVisibility,
    metadata: { ...entity.metadata, ...metadataFields },
  };
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

  return createSystemTool(
    "update",
    "Update an entity's fields or content. Requires confirmation.",
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
      if (
        input.confirmed &&
        entity.entityType === "agent" &&
        (agentStatus === "discovered" || agentStatus === "approved") &&
        ((!normalizedInput.content && !normalizedInput.fields) ||
          isBlankContentApprovalAttempt)
      ) {
        normalizedInput = {
          fields: { status: "approved" },
        };
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
        if (input.contentHash && entity.contentHash !== input.contentHash) {
          return {
            success: false,
            error:
              "Entity was modified since you reviewed the changes. Please try again.",
          };
        }

        if (normalizedInput.content !== undefined) {
          const trimmedContent = normalizedInput.content.trim();
          const frontmatterSchema =
            entityRegistry.getEffectiveFrontmatterSchema(entity.entityType);

          if (frontmatterSchema) {
            if (!trimmedContent) {
              return {
                success: false,
                error:
                  "Full content replacement cannot be empty for this entity type. Use 'fields' for partial updates.",
              };
            }

            try {
              entityRegistry
                .getAdapter(entity.entityType)
                .parseFrontMatter(normalizedInput.content, frontmatterSchema);
            } catch {
              return {
                success: false,
                error:
                  "Invalid content replacement for this entity type. Provide full markdown with valid frontmatter, or use 'fields' for partial updates.",
              };
            }
          }
        }

        const updated =
          normalizedInput.content !== undefined
            ? {
                ...entity,
                content: normalizedInput.content,
                visibility: extractVisibilityFromMarkdown(
                  normalizedInput.content,
                ),
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
            error:
              error instanceof Error
                ? error.message
                : "Failed to update entity",
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
        args: {
          ...input,
          ...normalizedInput,
          id: entity.id,
          confirmed: true,
          contentHash: entity.contentHash,
        },
      };
    },
    { visibility: "trusted" },
  );
}
