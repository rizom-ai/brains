import type { UserPermissionLevel } from "@brains/utils";

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
 */
export class PermissionService {
  private anchors: Set<string>;
  private trusted: Set<string>;
  private rules: PermissionRule[];

  constructor(config: PermissionConfig) {
    this.anchors = new Set(config.anchors || []);
    this.trusted = new Set(config.trusted || []);
    this.rules = config.rules || [];
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