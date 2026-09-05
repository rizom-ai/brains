import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { PublishAssetPreflight } from "../publish-asset-preflight";
import type { PublishAssetRegistry } from "../publish-assets";

export const ensureAssetsInputSchema: z.ZodObject<{
  entityType: z.ZodString;
  status: z.ZodOptional<z.ZodString>;
  assetType: z.ZodOptional<z.ZodString>;
}> = z.object({
  entityType: z.string().min(1).describe("Entity type to reconcile"),
  status: z
    .string()
    .min(1)
    .optional()
    .describe("Optional metadata status filter, e.g. published"),
  assetType: z
    .string()
    .min(1)
    .optional()
    .describe("Optional attachment type filter, e.g. og-image"),
});

export type EnsureAssetsInput = z.output<typeof ensureAssetsInputSchema>;

export const ensureAssetsOutputSchema: z.ZodObject<{
  success: z.ZodLiteral<true>;
  data: z.ZodObject<{
    entityType: z.ZodString;
    assetType: z.ZodOptional<z.ZodString>;
    checkedEntities: z.ZodNumber;
    checkedAssets: z.ZodNumber;
    enqueued: z.ZodNumber;
    skipped: z.ZodNumber;
  }>;
  message: z.ZodOptional<z.ZodString>;
}> = z.object({
  success: z.literal(true),
  data: z.object({
    entityType: z.string(),
    assetType: z.string().optional(),
    checkedEntities: z.number(),
    checkedAssets: z.number(),
    enqueued: z.number(),
    skipped: z.number(),
  }),
  message: z.string().optional(),
});

export type EnsureAssetsOutput = z.output<typeof ensureAssetsOutputSchema>;
export type EnsureAssetsOutputData = EnsureAssetsOutput["data"];

export interface EnsurePublishAssetsOptions {
  context: ServicePluginContext;
  registry: PublishAssetRegistry;
  preflight: PublishAssetPreflight;
  input: EnsureAssetsInput;
  toolContext: ToolContext;
}

export async function ensurePublishAssets({
  context,
  registry,
  preflight,
  input,
  toolContext,
}: EnsurePublishAssetsOptions): Promise<EnsureAssetsOutput> {
  context.permissions.assertEntityActionAllowed(
    input.entityType,
    "publish",
    toolContext,
  );

  const definitions = registry
    .list(input.entityType)
    .filter((definition) => definition.autoGenerate === true)
    .filter(
      (definition) =>
        !input.assetType || definition.attachmentType === input.assetType,
    );

  if (definitions.length === 0) {
    return {
      success: true,
      data: {
        entityType: input.entityType,
        ...(input.assetType && { assetType: input.assetType }),
        checkedEntities: 0,
        checkedAssets: 0,
        enqueued: 0,
        skipped: 0,
      },
      message: `No publish assets configured for ${input.entityType}`,
    };
  }

  const entities = await context.entityService.listEntities({
    entityType: input.entityType,
    options: {
      ...(input.status && {
        filter: { metadata: { status: input.status } },
      }),
    },
  });

  let checkedAssets = 0;
  let enqueued = 0;
  let skipped = 0;
  for (const entity of entities) {
    const result = await preflight.ensureForEntity(entity, {
      ...(input.assetType && { attachmentType: input.assetType }),
    });
    checkedAssets += result.checked;
    enqueued += result.enqueued;
    skipped += result.skipped;
  }

  return {
    success: true,
    data: {
      entityType: input.entityType,
      ...(input.assetType && { assetType: input.assetType }),
      checkedEntities: entities.length,
      checkedAssets,
      enqueued,
      skipped,
    },
    message: `Queued ${enqueued} publish asset job(s)`,
  };
}
