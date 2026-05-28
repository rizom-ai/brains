import {
  EntityActionPermissionError,
  type EntityAction,
} from "@brains/templates";
import type { Tool } from "@brains/mcp-service";
import type { SystemServices } from "./types";

export function assertEntityActionAllowed(
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
    if (
      error instanceof EntityActionPermissionError ||
      error instanceof Error
    ) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}
