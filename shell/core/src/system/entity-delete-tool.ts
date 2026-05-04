import { resolveEntityOrError } from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { deleteInputSchema } from "./schemas";
import type { SystemServices } from "./types";
import { createSystemTool, getEntityDisplayLabel } from "./tool-helpers";

export function createEntityDeleteTool(services: SystemServices): Tool {
  const { entityService, logger } = services;

  return createSystemTool(
    "delete",
    "Delete an entity. Requires confirmation.",
    deleteInputSchema,
    async (input) => {
      const resolved = await resolveEntityOrError(
        entityService,
        input.entityType,
        input.id,
        logger,
      );
      if (!resolved.ok) return { success: false, error: resolved.error };
      const { entity } = resolved;

      if (input.confirmed) {
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

      const label = getEntityDisplayLabel(entity);
      return {
        needsConfirmation: true,
        toolName: "system_delete",
        description: `Delete "${label}"?\n\nPreview:\n${entity.content.slice(0, 200)}`,
        args: { ...input, id: entity.id, confirmed: true },
      };
    },
    { visibility: "trusted" },
  );
}
