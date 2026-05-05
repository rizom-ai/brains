import { resolveEntityOrError } from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { createTool } from "@brains/mcp-service";
import { setCoverImageId } from "@brains/utils";
import { setCoverInputSchema } from "./schemas";
import type { SystemServices } from "./types";

export function createEntityCoverTool(services: SystemServices): Tool {
  const { entityService, logger } = services;

  return createTool(
    "system",
    "set-cover",
    "Set or remove cover image on an entity.",
    setCoverInputSchema,
    async (input) => {
      try {
        const resolved = await resolveEntityOrError(
          entityService,
          input.entityType,
          input.entityId,
          logger,
        );
        if (!resolved.ok) return { success: false, error: resolved.error };
        const { entity } = resolved;
        const adapter = services.entityRegistry.getAdapter(input.entityType);
        if (!adapter.supportsCoverImage)
          return {
            success: false,
            error: `Entity type '${input.entityType}' doesn't support cover images`,
          };
        if (input.imageId) {
          const image = await resolveEntityOrError(
            entityService,
            "image",
            input.imageId,
            logger,
            "Image",
          );
          if (!image.ok) return { success: false, error: image.error };
        }
        const updated = setCoverImageId(entity, input.imageId);
        await entityService.updateEntity({ entity: updated });
        return {
          success: true,
          data: {
            entityType: input.entityType,
            entityId: input.entityId,
            imageId: input.imageId,
          },
          message: input.imageId
            ? `Cover image set to '${input.imageId}' on ${input.entityType}/${input.entityId}`
            : `Cover image removed from ${input.entityType}/${input.entityId}`,
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to set cover image",
        };
      }
    },
    { visibility: "trusted" },
  );
}
