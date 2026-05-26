import {
  permissionToVisibilityScope,
  resolveEntityOrError,
} from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { deleteInputSchema } from "./schemas";
import { assertEntityActionAllowed } from "./entity-action-policy";
import type { SystemServices } from "./types";
import { createSystemTool, getEntityDisplayLabel } from "./tool-helpers";

const PROTECTED_ENTITY_TYPES = new Set(["brain-character", "anchor-profile"]);

export function createEntityDeleteTool(services: SystemServices): Tool {
  const { entityService, logger } = services;
  const pendingConfirmationTokens = new Set<string>();

  return createSystemTool(
    "delete",
    "Delete an entity. Requires confirmation. On the initial delete request, do not pass confirmed; the tool will return confirmation args after the user confirms.",
    deleteInputSchema,
    async (input, context) => {
      if (PROTECTED_ENTITY_TYPES.has(input.entityType)) {
        return {
          success: false,
          error: `${input.entityType} is a protected identity/profile record and cannot be deleted. Update it instead.`,
        };
      }

      const policyError = assertEntityActionAllowed(
        services,
        input.entityType,
        "delete",
        context,
      );
      if (policyError) return policyError;

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

      if (input.confirmed) {
        const token = input.confirmationToken;
        if (token && pendingConfirmationTokens.has(token)) {
          pendingConfirmationTokens.delete(token);
          try {
            await entityService.deleteEntity({
              entityType: input.entityType,
              id: entity.id,
            });
          } catch (error) {
            return {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to delete entity",
            };
          }
          return { success: true, data: { deleted: entity.id } };
        }
      }

      const label = getEntityDisplayLabel(entity);
      const confirmationToken = crypto.randomUUID();
      pendingConfirmationTokens.add(confirmationToken);
      return {
        needsConfirmation: true,
        toolName: "system_delete",
        description: `Delete "${label}"?\n\nPreview:\n${entity.content.slice(0, 200)}`,
        args: { ...input, id: entity.id, confirmed: true, confirmationToken },
      };
    },
    { visibility: "trusted" },
  );
}
