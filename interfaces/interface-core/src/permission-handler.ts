import type { PluginTool } from "@brains/types";
import type { UserPermissionLevel } from "./types";

/**
 * Handles permission checking and tool filtering for Matrix users
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
   * Filter tools based on user permissions
   */
  filterToolsByPermission(tools: PluginTool[], userId: string): PluginTool[] {
    const level = this.getUserPermissionLevel(userId);

    // Anchor gets all tools
    if (level === "anchor") {
      return tools;
    }

    // Public and trusted users only get public tools
    return tools.filter((tool) => tool.visibility === "public");
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
}
