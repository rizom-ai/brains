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
 * Additional context interfaces can provide for shared-space permission checks.
 */
export interface PermissionLookupContext {
  guildId?: string;
  workspaceId?: string;
  teamId?: string;
  channelId?: string;
  roomId?: string;
  isBot?: boolean;
  isGuest?: boolean;
}

export interface SharedSpaceContext extends PermissionLookupContext {
  interfaceType: string;
  userId: string;
}

export interface PermissionServiceOptions {
  /** Shared conversation space selectors, e.g. discord:123 or discord:project-* */
  spaces?: string[];
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
  private spaces: string[];

  constructor(
    config: PermissionConfig,
    options: PermissionServiceOptions = {},
  ) {
    this.anchors = new Set(config.anchors ?? []);
    this.trusted = new Set(config.trusted ?? []);
    this.rules = config.rules ?? [];
    this.spaces = options.spaces ?? [];
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
    context: PermissionLookupContext = {},
  ): UserPermissionLevel {
    const fullId = `${interfaceType}:${userId}`;

    // Check explicit lists first (highest priority)
    if (this.anchors.has(fullId)) return "anchor";
    if (this.trusted.has(fullId)) return "trusted";

    const patternLevel = this.getPatternLevel(fullId);
    if (patternLevel === "anchor" || patternLevel === "trusted") {
      return patternLevel;
    }

    if (
      this.matchesConfiguredSpace({
        interfaceType,
        userId,
        ...context,
      })
    ) {
      return "trusted";
    }

    return patternLevel ?? "public";
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

  private getPatternLevel(id: string): UserPermissionLevel | undefined {
    for (const rule of this.rules) {
      if (this.matchesPattern(id, rule.pattern)) {
        return rule.level;
      }
    }
    return undefined;
  }

  /**
   * Check if the lookup context matches one of the configured shared spaces.
   */
  private matchesConfiguredSpace(context: SharedSpaceContext): boolean {
    if (this.spaces.length === 0) return false;
    if (context.isBot || context.isGuest) return false;

    const candidates = this.getSpaceCandidates(context);
    return candidates.some((spaceId) =>
      this.spaces.some((selector) => this.matchesPattern(spaceId, selector)),
    );
  }

  private getSpaceCandidates(context: SharedSpaceContext): string[] {
    const candidates: string[] = [];
    if (context.channelId) {
      candidates.push(`${context.interfaceType}:${context.channelId}`);
    }
    if (context.roomId) {
      candidates.push(`${context.interfaceType}:${context.roomId}`);
    }
    return candidates;
  }

  /**
   * Check if an ID matches a pattern.
   * Supports wildcard (*) matching.
   * @param id The ID to test (e.g., "matrix:@user:example.org" or "discord:channel-id")
   * @param pattern The pattern to match (e.g., "matrix:@*:admin.org" or "discord:project-*")
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
