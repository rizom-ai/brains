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

// Add new actions only when a concrete mutating tool needs them.
export const EntityActionSchema = z.enum([
  "create",
  "update",
  "delete",
  "extract",
  "publish",
]);
export type EntityAction = z.infer<typeof EntityActionSchema>;

/**
 * Required level for an entity action.
 *
 * `never` forbids the action through system tools regardless of caller level.
 */
export const EntityActionRequiredLevelSchema = z.enum([
  "never",
  "anchor",
  "trusted",
  "public",
]);
export type EntityActionRequiredLevel = z.infer<
  typeof EntityActionRequiredLevelSchema
>;

export const entityActionPolicyRuleSchema = z
  .object({
    create: EntityActionRequiredLevelSchema.optional(),
    update: EntityActionRequiredLevelSchema.optional(),
    delete: EntityActionRequiredLevelSchema.optional(),
    extract: EntityActionRequiredLevelSchema.optional(),
    publish: EntityActionRequiredLevelSchema.optional(),
  })
  .strict();

export const entityActionPolicyConfigSchema = z.record(
  z.string(),
  entityActionPolicyRuleSchema,
);

export type EntityActionPolicyRule = z.infer<
  typeof entityActionPolicyRuleSchema
>;
export type EntityActionPolicyConfig = z.infer<
  typeof entityActionPolicyConfigSchema
>;
export type EntityActionPolicyEntry = EntityActionPolicyRule;
export type EntityActionPolicy = EntityActionPolicyConfig;

const ACTION_LABELS: Record<EntityAction, string> = {
  create: "Creating",
  update: "Updating",
  delete: "Deleting",
  extract: "Extracting",
  publish: "Publishing",
};

const LEVEL_LABELS: Record<UserPermissionLevel, string> = {
  public: "Public/public",
  trusted: "Collaborator/trusted",
  anchor: "Owner/anchor",
};

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
  entityActions?: EntityActionPolicyConfig;
}

export class EntityActionPermissionError extends Error {
  public readonly entityType: string;
  public readonly action: EntityAction;
  public readonly callerLevel: UserPermissionLevel;
  public readonly requiredLevel: UserPermissionLevel;

  constructor(input: {
    entityType: string;
    action: EntityAction;
    callerLevel: UserPermissionLevel;
    requiredLevel: UserPermissionLevel;
  }) {
    super(
      `${ACTION_LABELS[input.action]} \`${input.entityType}\` requires ${LEVEL_LABELS[input.requiredLevel]} permission; your current permission is ${LEVEL_LABELS[input.callerLevel]}.`,
    );
    this.name = "EntityActionPermissionError";
    this.entityType = input.entityType;
    this.action = input.action;
    this.callerLevel = input.callerLevel;
    this.requiredLevel = input.requiredLevel;
  }
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
  private entityActions?: EntityActionPolicyConfig;

  constructor(
    config: PermissionConfig,
    options: PermissionServiceOptions = {},
  ) {
    this.anchors = new Set(config.anchors ?? []);
    this.trusted = new Set(config.trusted ?? []);
    this.rules = config.rules ?? [];
    this.spaces = options.spaces ?? [];
    if (config.entityActions) {
      this.entityActions = entityActionPolicyConfigSchema.parse(
        config.entityActions,
      );
    }
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
   * Return the merged entity action policy for an entity type.
   * Entity-specific entries override the "*" default one action at a time.
   */
  getResolvedEntityActionPolicy(
    entityType: string,
  ): EntityActionPolicyRule | undefined {
    if (!this.entityActions) return undefined;

    const policy = {
      ...(this.entityActions["*"] ?? {}),
      ...(this.entityActions[entityType] ?? {}),
    };

    return Object.keys(policy).length > 0 ? policy : undefined;
  }

  getEntityActionRequiredLevel(
    entityType: string,
    action: EntityAction,
  ): EntityActionRequiredLevel | undefined {
    return this.getResolvedEntityActionPolicy(entityType)?.[action];
  }

  getRequiredEntityActionLevel(
    entityType: string,
    action: EntityAction,
  ): EntityActionRequiredLevel | undefined {
    return this.getEntityActionRequiredLevel(entityType, action);
  }

  canPerformEntityAction(
    userLevel: UserPermissionLevel | undefined,
    entityType: string,
    action: EntityAction,
  ): boolean {
    const requiredLevel = this.getEntityActionRequiredLevel(entityType, action);
    if (!requiredLevel) return true;
    if (requiredLevel === "never") return false;
    return this.hasPermission(userLevel ?? "public", requiredLevel);
  }

  assertEntityActionAllowed(
    entityType: string,
    action: EntityAction,
    userLevel: UserPermissionLevel | undefined,
  ): void {
    const requiredLevel = this.getEntityActionRequiredLevel(entityType, action);
    if (!requiredLevel) return;
    if (requiredLevel === "never") {
      throw new Error(
        `${ACTION_LABELS[action]} \`${entityType}\` is not allowed through system tools.`,
      );
    }

    const callerLevel = userLevel ?? "public";
    if (this.hasPermission(callerLevel, requiredLevel)) return;

    throw new EntityActionPermissionError({
      entityType,
      action,
      callerLevel,
      requiredLevel,
    });
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
