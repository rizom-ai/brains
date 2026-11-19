import {
  imageAspectRatioSchema,
  imageDescribeJobContract,
} from "@brains/contracts";
import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  SYSTEM_CHANNELS,
  entityCreatedChannel,
  internalFullScope,
  entityUpdatedChannel,
  serviceRuntime,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import { image } from "./image";
import {
  handleImageChange,
  queueUndescribedImages,
  type AltTextDeps,
} from "./lib/alt-text-listener";

/**
 * The package's settings, as the image entity plugin took them; a brain
 * config naming one stays valid.
 */
export const imageConfigSchema: z.ZodObject<{
  defaultAspectRatio: z.ZodDefault<typeof imageAspectRatioSchema>;
}> = z.object({
  defaultAspectRatio: imageAspectRatioSchema
    .default("16:9")
    .describe("Default aspect ratio for generated images"),
});

/** The listener's reads, writes and queue, over the package's runtime. */
function altTextDeps(runtime: ServiceRuntime): AltTextDeps {
  return {
    canDescribe: (): boolean => runtime.ai.canDescribeImages(),
    readStored: (id): Promise<BaseEntity | null> =>
      runtime.entityReads.getEntityRaw({
        entityType: "image",
        id,
        visibilityScope: internalFullScope(
          "an image's alt text is marked the owner's at any visibility",
        ),
        source: true,
      }),
    listPublic: (): Promise<BaseEntity[]> =>
      runtime.entityReads.listEntities({
        entityType: "image",
        options: { filter: { visibilityScope: "public" } },
      }),
    // Signed as the service, so the listener never takes it for the owner's.
    update: (entity): Promise<unknown> =>
      runtime.entityWrites.updateEntity({
        entity,
        options: {
          eventContext: {
            actor: { kind: "service", serviceId: "image-alt-text" },
            interfaceType: "job",
          },
        },
      }),
    enqueueDescribe: (imageId): Promise<unknown> =>
      runtime.retries.run(
        () =>
          runtime.jobs.enqueue(
            imageDescribeJobContract,
            { imageId },
            {
              toolContext: {
                interfaceType: "job",
                actor: { kind: "service", serviceId: "image-alt-text" },
              },
              // One description waits per image, however often it changes.
              options: {
                source: "image-alt-text",
                metadata: { operationType: "data_processing", silent: true },
                deduplication: "skip",
                deduplicationKey: `image-describe:${imageId}`,
              },
            },
          ),
        "queue an image description",
        `image-describe:${imageId}`,
      ),
  };
}

/** Images: generated, rendered from attachments, or promoted from uploads. */
export const imagePackage: EntityPackageDefinition<
  readonly [typeof image],
  readonly [],
  typeof imageConfigSchema
> = defineEntityPackage({
  id: "image",
  config: imageConfigSchema,
  entities: [image],
});

/**
 * Alt text for the images: a public image whose alt text is a stand-in is
 * described by the brain's vision model as soon as it is ready, and once at
 * start-up for the images already there; alt text someone rewrites becomes
 * the owner's. Installed beside the images, which keep their own plugin id.
 */
const imageAltTextConfigSchema: z.ZodObject<Record<never, never>> = z.object(
  {},
);

export const imageAltTextPackage: ServicePackageDefinition<
  typeof imageAltTextConfigSchema
> = defineServicePlugin({
  id: "image-alt-text",
  config: imageAltTextConfigSchema,
  setup: async (setupContext): Promise<Record<never, never>> => {
    const runtime = serviceRuntime(setupContext);
    const deps = altTextDeps(runtime);
    for (const channel of [entityCreatedChannel, entityUpdatedChannel]) {
      // Execution listeners run once, in the process that made the change.
      runtime.listen(
        channel,
        async ({ payload }) => handleImageChange(deps, payload),
        { mode: "execution" },
      );
    }
    runtime.listen(SYSTEM_CHANNELS.startupContentSettled, async () =>
      queueUndescribedImages(deps),
    );
    return {};
  },
});

export default imagePackage;

export { image } from "./image";
export {
  uploadPromotionJobContract,
  uploadPromotionJobSchema,
  type UploadPromotionJobData,
  type UploadPromotionJobResult,
} from "./jobs/promote-upload";
