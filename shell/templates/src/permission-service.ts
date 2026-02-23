import { z } from "@brains/utils";

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
 */
export interface WithVisibility {
  visibility?: UserPermissionLevel;
}

/**
 * Permission rule for pattern-based permission matching
 */
export interface PermissionRule {
  pattern: string;
  level: UserPermissionLevel;
}

/**
 * Configuration for the permission system
 */
export interface PermissionConfig {
  anchors?: string[];
  trusted?: string[];
  rules?: PermissionRule[];
}

/**
 * Centralized permission service for determining user permission levels
 * Handles both explicit user lists and pattern-based rules
 * Replaces the old PermissionHandler from @brains/utils
 */
export class PermissionService {
  private anchors: Set<string>;
  private trusted: Set<string>;
  private rules: PermissionRule[];

  constructor(config: PermissionConfig) {
    this.anchors = new Set(config.anchors ?? []);
    this.trusted = new Set(config.trusted ?? []);
    this.rules = config.rules ?? [];
  }

  /**
   * Determine the permission level for a user in a specific interface
   * @param interfaceType The type of interface (e.g., "matrix", "cli", "discord")
   * @param userId The user ID specific to that interface
   * @returns The user's permission level
   */
  determineUserLevel(
    interfaceType: string,
    userId: string,
  ): UserPermissionLevel {
    const fullId = `${interfaceType}:${userId}`;

    // Check explicit lists first (highest priority)
    if (this.anchors.has(fullId)) return "anchor";
    if (this.trusted.has(fullId)) return "trusted";

    // Then check pattern rules (in order)
    for (const rule of this.rules) {
      if (this.matchesPattern(fullId, rule.pattern)) {
        return rule.level;
      }
    }

    // Default to public for unknown users
    return "public";
  }

  /**
   * Check if a user has a specific permission level or higher
   * @param userLevel The user's actual permission level
   * @param requiredLevel The required permission level
   * @returns True if the user meets the permission requirement
   */
  hasPermission(
    userLevel: UserPermissionLevel,
    requiredLevel: UserPermissionLevel,
  ): boolean {
    return PermissionService.hasPermission(userLevel, requiredLevel);
  }

  /**
   * Filter items based on user permission level
   * Works for tools, commands, or any item with a visibility property
   * @param items Array of items with visibility levels
   * @param userLevel The user's permission level
   * @returns Filtered array of items the user can access
   */
  filterByPermission<T extends WithVisibility>(
    items: T[],
    userLevel: UserPermissionLevel,
  ): T[] {
    return items.filter((item) => {
      const requiredLevel = item.visibility ?? "public";
      return this.hasPermission(userLevel, requiredLevel);
    });
  }

  /**
   * Static method to check if a permission level meets the required level
   * Used by Shell for interface-based permission checking (commands, templates, etc.)
   * Maintains compatibility with existing Shell.generateContent() usage
   */
  static hasPermission(
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

  /**
   * Check if a full user ID matches a pattern
   * Supports wildcard (*) matching
   * @param id The full user ID (e.g., "matrix:@user:example.org")
   * @param pattern The pattern to match (e.g., "matrix:@*:admin.org")
   * @returns True if the ID matches the pattern
   */
  private matchesPattern(id: string, pattern: string): boolean {
    // Convert pattern to regex
    // Escape regex special characters except *
    const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    // Replace * with .* for wildcard matching
    const regexPattern = "^" + escapedPattern.replace(/\*/g, ".*") + "$";
    const regex = new RegExp(regexPattern);
    return regex.test(id);
  }
}
