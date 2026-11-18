import type { EntityAction } from "@brains/templates";
import type { Tool } from "@brains/mcp-service";
import type { SystemServices } from "./types";

/**
 * The refusal of an entity action the caller's permission does not allow,
 * or undefined when it is allowed.
 */
export function entityActionRefusal(
  services: SystemServices,
  entityType: string,
  action: EntityAction,
  context: Parameters<Tool["handler"]>[1],
): { success: false; error: string } | undefined {
  try {
    services.permissionService.assertEntityActionAllowed(
      entityType,
      action,
      context.userPermissionLevel,
    );
    return undefined;
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

/**
 * Whether the brain's resolved action policy never lets system tools take
 * this action on the entity type, whoever calls: the same for every caller,
 * so a tool's schema can leave the type out.
 */
export function systemToolsNeverWrite(
  permissionService: Pick<
    SystemServices["permissionService"],
    "getEntityActionRequiredLevel"
  >,
): (entityType: string, action: EntityAction) => boolean {
  return (entityType, action) =>
    permissionService.getEntityActionRequiredLevel(entityType, action) ===
    "never";
}
