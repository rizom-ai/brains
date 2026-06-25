import {
  permissionToVisibilityScope,
  resolveEntityOrError,
} from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { deleteInputSchema } from "./schemas";
import { assertEntityActionAllowed } from "./entity-action-policy";
import type { SystemServices } from "./types";
import {
  assertEntityTypeRegistered,
  createSystemTool,
  getEntityDisplayLabel,
} from "./tool-helpers";

export function createEntityDeleteTool(services: SystemServices): Tool {
  const { entityService, entityRegistry, logger } = services;
  const pendingConfirmationTokens = new Set<string>();

  return createSystemTool(
    "delete",
    "Request entity deletion by id. Unauthorized callers get a permission error; authorized callers get confirmation first. Do not pass confirmed on the initial request.",
    deleteInputSchema,
    async (input, context) => {
      if ((context.userPermissionLevel ?? "public") === "public") {
        return {
          success: false,
          error:
            "Changing content requires higher permission; current permission is Public.",
        };
      }

      const policyError = assertEntityActionAllowed(
        services,
        input.entityType,
        "delete",
        context,
      );
      if (policyError) return policyError;

      // Guard before getAdapter below, which would otherwise throw the raw
      // "No adapter registered" registry string for an unregistered type.
      const unregisteredError = assertEntityTypeRegistered(
        services,
        input.entityType,
      );
      if (unregisteredError) return unregisteredError;

      if (entityRegistry.getAdapter(input.entityType).isSingleton === true) {
        return {
          success: false,
          error: `${input.entityType} is a singleton entity and cannot be deleted through system tools. Update it instead.`,
        };
      }

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
        summary: `Delete "${label}"?`,
        preview: entity.content.slice(0, 200),
        args: { ...input, id: entity.id, confirmed: true, confirmationToken },
      };
    },
    { visibility: "public", sideEffects: "writes" },
  );
}
