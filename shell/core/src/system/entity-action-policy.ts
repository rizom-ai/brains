import {
  EntityActionPermissionError,
  type EntityAction,
} from "@brains/templates";
import type { Tool } from "@brains/mcp-service";
import { toSdkError, type SdkErrorCode } from "@brains/contracts";
import type { SystemServices } from "./types";

export function assertEntityActionAllowed(
  services: SystemServices,
  entityType: string,
  action: EntityAction,
  context: Parameters<Tool["handler"]>[1],
): { success: false; error: string; code: SdkErrorCode } | undefined {
  try {
    services.permissionService.assertEntityActionAllowed(
      entityType,
      action,
      context.userPermissionLevel,
    );
    return undefined;
  } catch (error) {
    const failure = toSdkError(error);
    return {
      success: false,
      code: failure.code,
      // This native refusal deliberately describes the required permission.
      // Other copies still retain their code, but not arbitrary diagnostic text.
      error:
        error instanceof EntityActionPermissionError
          ? error.message
          : failure.message,
    };
  }
}
