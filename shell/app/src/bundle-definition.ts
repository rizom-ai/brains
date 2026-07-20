import type { PermissionConfig } from "@brains/templates";
import { z } from "@brains/utils/zod";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
    ) as T;
  }

  return value;
}

export interface BundleConfigContribution {
  member: string;
  value: Record<string, unknown>;
  overrides?: string | undefined;
}

export interface BundlePermissionContribution {
  member: string;
  config: PermissionConfig;
}

export interface CapabilityBundleDefinition {
  id: string;
  members: string[];
  config?: BundleConfigContribution[] | undefined;
  permissions?: BundlePermissionContribution[] | undefined;
  agentInstructions?: string[] | undefined;
  evalDisable?: string[] | undefined;
}

const bundleIdSchema = z.string().min(1);

export const bundleConfigContributionSchema: z.ZodType<BundleConfigContribution> =
  z.strictObject({
    member: bundleIdSchema,
    value: z.record(z.string(), z.unknown()),
    overrides: bundleIdSchema.optional(),
  });

const opaquePermissionConfigSchema = z.custom<PermissionConfig>(isPlainRecord, {
  message: "Expected an opaque permission config object",
});

export const bundlePermissionContributionSchema: z.ZodType<BundlePermissionContribution> =
  z.strictObject({
    member: bundleIdSchema,
    config: opaquePermissionConfigSchema,
  });

const rawCapabilityBundleDefinitionSchema: z.ZodType<CapabilityBundleDefinition> =
  z.strictObject({
    id: bundleIdSchema,
    members: z.array(bundleIdSchema),
    config: z.array(bundleConfigContributionSchema).optional(),
    permissions: z.array(bundlePermissionContributionSchema).optional(),
    agentInstructions: z.array(z.string().min(1)).optional(),
    evalDisable: z.array(bundleIdSchema).optional(),
  });

function addDuplicateIssues(
  values: readonly string[],
  label: string,
  path: string,
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate ${label} "${value}"`,
        path: [path, index],
      });
    }
    seen.add(value);
  }
}

export const capabilityBundleDefinitionSchema: z.ZodType<CapabilityBundleDefinition> =
  rawCapabilityBundleDefinitionSchema.superRefine((definition, ctx) => {
    addDuplicateIssues(definition.members, "member", "members", ctx);
    addDuplicateIssues(
      definition.evalDisable ?? [],
      "eval exclusion",
      "evalDisable",
      ctx,
    );

    const members = new Set(definition.members);
    for (const [index, contribution] of (definition.config ?? []).entries()) {
      if (!members.has(contribution.member)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Config contribution member "${contribution.member}" is not a member of bundle "${definition.id}"`,
          path: ["config", index, "member"],
        });
      }
    }

    for (const [index, contribution] of (
      definition.permissions ?? []
    ).entries()) {
      if (!members.has(contribution.member)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Permission contribution member "${contribution.member}" is not a member of bundle "${definition.id}"`,
          path: ["permissions", index, "member"],
        });
      }
    }

    for (const [index, member] of (definition.evalDisable ?? []).entries()) {
      if (!members.has(member)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Eval exclusion member "${member}" is not a member of bundle "${definition.id}"`,
          path: ["evalDisable", index],
        });
      }
    }
  });

/** Validate bundle data without constructing any plugins or runtime resources. */
export function defineBundle(
  definition: CapabilityBundleDefinition,
): CapabilityBundleDefinition {
  return cloneValue(capabilityBundleDefinitionSchema.parse(definition));
}
