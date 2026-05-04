import { resolveEntityOrError } from "@brains/entity-service";
import type { BaseEntity } from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { updateInputSchema } from "./schemas";
import type { SystemServices } from "./types";
import {
  createSystemTool,
  getEntityDisplayLabel,
  normalizeUpdateInput,
} from "./tool-helpers";

function buildUpdateDiff(
  entity: BaseEntity,
  normalizedInput: { fields?: Record<string, unknown>; content?: string },
): string {
  if (normalizedInput.fields) {
    return Object.entries(normalizedInput.fields)
      .map(
        ([key, val]) =>
          `${key}: ${String(entity.metadata[key] ?? "(empty)")} → ${String(val)}`,
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
    async (input) => {
      const resolved = await resolveEntityOrError(
        entityService,
        input.entityType,
        input.id,
        logger,
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
            ? { ...entity, content: normalizedInput.content }
            : {
                ...entity,
                metadata: { ...entity.metadata, ...normalizedInput.fields },
              };
        try {
          await entityService.updateEntity({ entity: updated });
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
        description: `Update "${label}"?\n\nChanges:\n${diff}`,
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
