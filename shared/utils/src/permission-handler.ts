import { z } from "zod";

/**
 * User permission level schema
 */
export const UserPermissionLevelSchema = z.enum([
  "anchor",
  "trusted",
  "public",
]);

export type UserPermissionLevel = z.infer<typeof UserPermissionLevelSchema>;

/**
 * Generic interface for items with visibility
 * Used to avoid circular dependency with plugins package
 */
export interface WithVisibility {
  visibility?: UserPermissionLevel;
}

/**
 * Handles permission checking and tool filtering for all interfaces
 */
export class PermissionHandler {
  private readonly anchorUserId: string;
  private readonly trustedUserIds: Set<string>;

  constructor(anchorUserId: string, trustedUsers?: string[]) {
    this.anchorUserId = anchorUserId;
    this.trustedUserIds = new Set(trustedUsers ?? []);
  }

  /**
   * Get the permission level for a user
   */
  getUserPermissionLevel(userId: string): UserPermissionLevel {
    if (userId === this.anchorUserId) {
      return "anchor";
    }
    if (this.trustedUserIds.has(userId)) {
      return "trusted";
    }
    return "public";
  }

  /**
   * Check if a user can access a specific template
   */
  canUseTemplate(
    userLevel: UserPermissionLevel,
    requiredPermission: UserPermissionLevel,
  ): boolean {
    if (requiredPermission === "public") {
      return true; // Everyone has public access
    }

    if (requiredPermission === "trusted") {
      return userLevel === "trusted" || userLevel === "anchor";
    }

    // At this point, requiredPermission must be "anchor"
    return userLevel === "anchor";
  }

  /**
   * Check if a user can use a specific command
   */
  canUseCommand(userId: string, _command: string): boolean {
    const level = this.getUserPermissionLevel(userId);

    // Anchor can use everything
    if (level === "anchor") {
      return true;
    }

    // For now, trusted users have same access as public
    // This can be expanded later
    return true;
  }

  /**
   * Filter tools based on user permission level
   */
  filterToolsByPermission<T extends WithVisibility>(
    tools: T[],
    userLevel: UserPermissionLevel,
  ): T[] {
    // Anchor gets all tools
    if (userLevel === "anchor") {
      return tools;
    }

    // Trusted gets trusted + public tools
    if (userLevel === "trusted") {
      return tools.filter(
        (tool) => tool.visibility === "public" || tool.visibility === "trusted",
      );
    }

    // Public gets only public tools
    return tools.filter((tool) => tool.visibility === "public");
  }

  /**
   * Filter tools based on user ID (convenience method)
   */
  filterToolsByUserId<T extends WithVisibility>(tools: T[], userId: string): T[] {
    const level = this.getUserPermissionLevel(userId);
    return this.filterToolsByPermission(tools, level);
  }

  /**
   * Check if a user has a specific permission level or higher
   */
  hasPermission(userId: string, requiredLevel: UserPermissionLevel): boolean {
    const userLevel = this.getUserPermissionLevel(userId);

    if (requiredLevel === "public") {
      return true; // Everyone has public access
    }

    if (requiredLevel === "trusted") {
      return userLevel === "trusted" || userLevel === "anchor";
    }

    // At this point, requiredLevel must be "anchor" (the only remaining option)
    return userLevel === "anchor";
  }

  /**
   * Add a trusted user
   */
  addTrustedUser(userId: string): void {
    if (userId !== this.anchorUserId) {
      this.trustedUserIds.add(userId);
    }
  }

  /**
   * Remove a trusted user
   */
  removeTrustedUser(userId: string): void {
    this.trustedUserIds.delete(userId);
  }

  /**
   * Get all trusted users
   */
  getTrustedUsers(): string[] {
    return Array.from(this.trustedUserIds);
  }

  /**
   * Check if a user is the anchor
   */
  isAnchor(userId: string): boolean {
    return userId === this.anchorUserId;
  }

  /**
   * Check if a user is trusted
   */
  isTrusted(userId: string): boolean {
    return this.trustedUserIds.has(userId);
  }

  /**
   * Determine effective permission level considering interface grants
   * Interface grants override user permissions (Interface Grant Override model)
   */
  getEffectivePermissionLevel(
    userId: string | null | undefined,
    interfacePermissionGrant?: UserPermissionLevel,
  ): UserPermissionLevel {
    // If interface provides a permission grant, use it (interface override)
    if (interfacePermissionGrant) {
      return interfacePermissionGrant;
    }

    // If no userId provided, default to public permissions
    if (!userId) {
      return "public";
    }

    // Otherwise, use the user's actual permission level
    return this.getUserPermissionLevel(userId);
  }

  /**
   * Static method to check if a permission level can use a template
   * Used by Shell for interface-based permission checking
   */
  static canUseTemplate(
    grantedLevel: UserPermissionLevel,
    requiredLevel: UserPermissionLevel,
  ): boolean {
    if (requiredLevel === "public") {
      return true; // Everyone has public access
    }

    if (requiredLevel === "trusted") {
      return grantedLevel === "trusted" || grantedLevel === "anchor";
    }

    // At this point, requiredLevel must be "anchor"
    return grantedLevel === "anchor";
  }
}
