import type { BaseEntity, ServicePluginContext, Tool } from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { z } from "@brains/utils";
import type { PublishAssetPreflight } from "../publish-asset-preflight";
import type { PublishAssetRegistry } from "../publish-assets";

export const ensureAssetsInputSchema = z.object({
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

export type EnsureAssetsInput = z.infer<typeof ensureAssetsInputSchema>;

export const ensureAssetsOutputSchema = z.object({
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

export type EnsureAssetsOutput = z.infer<typeof ensureAssetsOutputSchema>;

export function createEnsureAssetsTool(
  context: ServicePluginContext,
  pluginId: string,
  registry: PublishAssetRegistry,
  preflight: PublishAssetPreflight,
): Tool<EnsureAssetsOutput> {
  const tool = createTool(
    pluginId,
    "ensure-assets",
    "Reconcile configured publish assets for existing entities, queueing missing generated assets such as OG images.",
    ensureAssetsInputSchema,
    async (input, toolContext) => {
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

      const entities = await context.entityService.listEntities<BaseEntity>({
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
    },
  );

  return {
    ...tool,
    outputSchema: ensureAssetsOutputSchema,
  } as Tool<EnsureAssetsOutput>;
}
