import { z } from "@brains/utils";
import { matchSpaceSelector } from "./space-selector";

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
 *
 * Each interface normalizes its location concept (Discord channel/thread,
 * Slack channel, Matrix room, ...) into the single canonical `channelId`
 * before calling the resolver.
 */
export interface PermissionLookupContext {
  channelId?: string;
  isBot?: boolean;
  isGuest?: boolean;
}

interface SharedSpaceContext extends PermissionLookupContext {
  interfaceType: string;
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
   * Determine the permission level for a user in a specific interface.
   *
   * Resolution order (load-bearing — locks user-facing trust semantics):
   *   1. Explicit anchor/trusted lists win — they encode operator intent.
   *   2. Pattern rules granting anchor/trusted win — same intent, broader.
   *   3. Configured shared-space membership grants `trusted` — only raises
   *      otherwise-public callers; never elevates to `anchor`.
   *   4. Public-fallback pattern rules apply.
   *   5. Default `public`.
   */
  determineUserLevel(
    interfaceType: string,
    userId: string,
    context: PermissionLookupContext = {},
  ): UserPermissionLevel {
    const fullId = `${interfaceType}:${userId}`;

    if (this.anchors.has(fullId)) return "anchor";
    if (this.trusted.has(fullId)) return "trusted";

    const patternLevel = this.getPatternLevel(fullId);
    if (patternLevel === "anchor" || patternLevel === "trusted") {
      return patternLevel;
    }

    if (
      this.spaces.length > 0 &&
      this.matchesConfiguredSpace({ interfaceType, ...context })
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
      if (matchSpaceSelector(rule.pattern, id)) {
        return rule.level;
      }
    }
    return undefined;
  }

  private matchesConfiguredSpace(context: SharedSpaceContext): boolean {
    if (context.isBot || context.isGuest) return false;
    if (!context.channelId) return false;

    const spaceId = `${context.interfaceType}:${context.channelId}`;
    return this.spaces.some((selector) =>
      matchSpaceSelector(selector, spaceId),
    );
  }
}
