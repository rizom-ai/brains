import type { UserPermissionLevel } from "@brains/plugins";

/**
 * Check if a tool should be registered based on permissions
 */
export function shouldRegisterTool(
  serverPermission: UserPermissionLevel,
  toolVisibility: UserPermissionLevel,
): boolean {
  const hierarchy: Record<UserPermissionLevel, number> = {
    anchor: 3,
    trusted: 2,
    public: 1,
  };

  return hierarchy[serverPermission] >= hierarchy[toolVisibility];
}

/**
 * Check if a resource should be registered based on permissions
 */
export function shouldRegisterResource(
  serverPermission: UserPermissionLevel,
  resourceVisibility: UserPermissionLevel,
): boolean {
  // Use same logic as tools
  return shouldRegisterTool(serverPermission, resourceVisibility);
}