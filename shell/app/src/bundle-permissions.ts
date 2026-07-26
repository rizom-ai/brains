import {
  EntityActionRequiredLevelSchema,
  UserPermissionLevelSchema,
  entityActionPolicyConfigSchema,
  type EntityActionPolicyConfigInput,
  type PermissionConfig,
  type UserPermissionLevel,
} from "@brains/templates";
import { z } from "@brains/utils/zod";
import type { CapabilityBundleDefinition } from "./bundle-definition";
import type { ResolvedBundlePermissionContribution } from "./bundle-resolution";

const permissionRuleSchema = z.strictObject({
  pattern: z.string(),
  level: UserPermissionLevelSchema,
});

const bundlePermissionConfigSchema = z.strictObject({
  admins: z.array(z.string()).optional(),
  anchors: z.array(z.string()).optional(),
  trusted: z.array(z.string()).optional(),
  rules: z.array(permissionRuleSchema).optional(),
  entityActions: entityActionPolicyConfigSchema.optional(),
});

interface SourcedValue<T> {
  value: T;
  sources: Set<string>;
}

interface PermissionState {
  admins: Set<string>;
  anchors: Set<string>;
  trusted: Set<string>;
  rules: Map<string, SourcedValue<UserPermissionLevel>>;
  entityActions: Map<string, SourcedValue<string>>;
}

function createPermissionState(): PermissionState {
  return {
    admins: new Set(),
    anchors: new Set(),
    trusted: new Set(),
    rules: new Map(),
    entityActions: new Map(),
  };
}

function assignSourcedValue<T>(input: {
  values: Map<string, SourcedValue<T>>;
  key: string;
  displayPath: string;
  value: T;
  bundleId: string;
  overrides: string | undefined;
}): boolean {
  const { values, key, displayPath, value, bundleId, overrides } = input;
  const existing = values.get(key);
  if (!existing) {
    values.set(key, { value, sources: new Set([bundleId]) });
    return false;
  }

  if (Object.is(existing.value, value)) {
    existing.sources.add(bundleId);
    return false;
  }

  const canOverride =
    overrides !== undefined &&
    existing.sources.size > 0 &&
    [...existing.sources].every((source) => source === overrides);
  if (!canOverride) {
    const existingSources = [...existing.sources]
      .map((source) => `"${source}"`)
      .join(", ");
    throw new Error(
      `Permission conflict at "${displayPath}" between bundles ${existingSources} and "${bundleId}"`,
    );
  }

  values.set(key, { value, sources: new Set([bundleId]) });
  return true;
}

function parseContribution(
  contribution: ResolvedBundlePermissionContribution,
): PermissionConfig {
  const parsed = bundlePermissionConfigSchema.safeParse(contribution.config);
  if (!parsed.success) {
    throw new Error(
      `Invalid permission contribution from bundle "${contribution.bundleId}" for member "${contribution.member}": ${parsed.error.message}`,
    );
  }
  return {
    ...(parsed.data.admins ? { admins: parsed.data.admins } : {}),
    ...(parsed.data.anchors ? { anchors: parsed.data.anchors } : {}),
    ...(parsed.data.trusted ? { trusted: parsed.data.trusted } : {}),
    ...(parsed.data.rules ? { rules: parsed.data.rules } : {}),
    ...(parsed.data.entityActions
      ? { entityActions: parsed.data.entityActions }
      : {}),
  };
}

function composePermissionContributions(
  contributions: readonly ResolvedBundlePermissionContribution[],
  requireUsedOverrides: boolean,
): PermissionConfig | undefined {
  if (contributions.length === 0) return undefined;

  const state = createPermissionState();
  for (const contribution of contributions) {
    const config = parseContribution(contribution);
    let usedOverride = false;

    for (const admin of config.admins ?? []) state.admins.add(admin);
    for (const anchor of config.anchors ?? []) state.anchors.add(anchor);
    for (const trusted of config.trusted ?? []) state.trusted.add(trusted);

    for (const rule of config.rules ?? []) {
      const didOverride = assignSourcedValue({
        values: state.rules,
        key: rule.pattern,
        displayPath: `rules.${rule.pattern}`,
        value: rule.level,
        bundleId: contribution.bundleId,
        overrides: contribution.overrides,
      });
      usedOverride ||= didOverride;
    }

    for (const [entityType, policy] of Object.entries(
      config.entityActions ?? {},
    )) {
      for (const [action, requiredLevel] of Object.entries(policy)) {
        if (requiredLevel === undefined) continue;
        const key = `${entityType}\u0000${action}`;
        const didOverride = assignSourcedValue({
          values: state.entityActions,
          key,
          displayPath: `entityActions.${entityType}.${action}`,
          value: EntityActionRequiredLevelSchema.parse(requiredLevel),
          bundleId: contribution.bundleId,
          overrides: contribution.overrides,
        });
        usedOverride ||= didOverride;
      }
    }

    if (requireUsedOverrides && contribution.overrides && !usedOverride) {
      throw new Error(
        `Permission override of "${contribution.overrides}" in bundle "${contribution.bundleId}" does not replace a conflicting permission`,
      );
    }
  }

  const entityActions: EntityActionPolicyConfigInput = {};
  for (const [key, sourced] of state.entityActions) {
    const separator = key.indexOf("\u0000");
    const entityType = key.slice(0, separator);
    const action = key.slice(separator + 1);
    entityActions[entityType] = {
      ...(entityActions[entityType] ?? {}),
      [action]: sourced.value,
    };
  }

  return {
    ...(state.admins.size > 0 ? { admins: [...state.admins] } : {}),
    ...(state.anchors.size > 0 ? { anchors: [...state.anchors] } : {}),
    ...(state.trusted.size > 0 ? { trusted: [...state.trusted] } : {}),
    ...(state.rules.size > 0
      ? {
          rules: [...state.rules].map(([pattern, sourced]) => ({
            pattern,
            level: sourced.value,
          })),
        }
      : {}),
    ...(Object.keys(entityActions).length > 0 ? { entityActions } : {}),
  };
}

function allPermissionContributions(
  definitions: readonly CapabilityBundleDefinition[],
): ResolvedBundlePermissionContribution[] {
  return definitions.flatMap((definition) =>
    (definition.permissions ?? []).map(({ member, config, overrides }) => ({
      bundleId: definition.id,
      member,
      config,
      ...(overrides ? { overrides } : {}),
    })),
  );
}

/** Validate all definitions, then compose only active member contributions. */
export function resolveBundlePermissionConfig(
  definitions: readonly CapabilityBundleDefinition[],
  activeContributions: readonly ResolvedBundlePermissionContribution[],
): PermissionConfig | undefined {
  composePermissionContributions(allPermissionContributions(definitions), true);
  return composePermissionContributions(activeContributions, false);
}
