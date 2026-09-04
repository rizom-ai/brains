import type { PermissionConfig } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { clonePlainData } from "@brains/utils/clone";
import { isPlainRecord } from "@brains/utils/predicates";

export interface BundleConfigContribution {
  member: string;
  value: Record<string, unknown>;
  overrides?: string | undefined;
}

export interface BundlePermissionContribution {
  member: string;
  config: PermissionConfig;
  overrides?: string | undefined;
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
    overrides: bundleIdSchema.optional(),
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
  });

/** Validate bundle data without constructing any plugins or runtime resources. */
export function defineBundle(
  definition: CapabilityBundleDefinition,
): CapabilityBundleDefinition {
  return clonePlainData(capabilityBundleDefinitionSchema.parse(definition));
}
