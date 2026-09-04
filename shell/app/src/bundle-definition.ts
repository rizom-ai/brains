import type { PermissionConfig } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { clonePlainData } from "@brains/utils/clone";
import { isPlainRecord } from "@brains/utils/predicates";

const bundleIdSchema: z.ZodString = z.string().min(1);

type BundleConfigContributionSchema = z.ZodObject<
  {
    member: z.ZodString;
    value: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    overrides: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
>;

export const bundleConfigContributionSchema: BundleConfigContributionSchema =
  z.strictObject({
    member: bundleIdSchema,
    value: z.record(z.string(), z.unknown()),
    overrides: bundleIdSchema.optional(),
  });

export type BundleConfigContribution = z.output<
  typeof bundleConfigContributionSchema
>;

const opaquePermissionConfigSchema: z.ZodCustom<
  PermissionConfig,
  PermissionConfig
> = z.custom<PermissionConfig>(isPlainRecord, {
  message: "Expected an opaque permission config object",
});

type BundlePermissionContributionSchema = z.ZodObject<
  {
    member: z.ZodString;
    config: typeof opaquePermissionConfigSchema;
    overrides: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
>;

export const bundlePermissionContributionSchema: BundlePermissionContributionSchema =
  z.strictObject({
    member: bundleIdSchema,
    config: opaquePermissionConfigSchema,
    overrides: bundleIdSchema.optional(),
  });

export type BundlePermissionContribution = z.output<
  typeof bundlePermissionContributionSchema
>;

type CapabilityBundleDefinitionSchema = z.ZodObject<
  {
    id: z.ZodString;
    members: z.ZodArray<z.ZodString>;
    config: z.ZodOptional<z.ZodArray<BundleConfigContributionSchema>>;
    permissions: z.ZodOptional<z.ZodArray<BundlePermissionContributionSchema>>;
    agentInstructions: z.ZodOptional<z.ZodArray<z.ZodString>>;
    evalDisable: z.ZodOptional<z.ZodArray<z.ZodString>>;
  },
  z.core.$strict
>;

const rawCapabilityBundleDefinitionSchema: CapabilityBundleDefinitionSchema =
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

export const capabilityBundleDefinitionSchema: CapabilityBundleDefinitionSchema =
  rawCapabilityBundleDefinitionSchema.superRefine((definition, ctx) => {
    addDuplicateIssues(definition.members, "member", "members", ctx);
    addDuplicateIssues(
      definition.evalDisable ?? [],
      "eval exclusion",
      "evalDisable",
      ctx,
    );
  });

export type CapabilityBundleDefinition = z.output<
  typeof capabilityBundleDefinitionSchema
>;

/** Validate bundle data without constructing any plugins or runtime resources. */
export function defineBundle(
  definition: CapabilityBundleDefinition,
): CapabilityBundleDefinition {
  return clonePlainData(capabilityBundleDefinitionSchema.parse(definition));
}
