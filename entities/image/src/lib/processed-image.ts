import type {
  EntityJobHandleContext,
  EntityDefinition,
} from "@brains/sdk/entities";
import type { EntityRuntimeAssets } from "@brains/sdk/internal/entity-runtime";
import type {
  imageMetadataSchema,
  ImageMetadata,
  StagedImageEntity,
} from "@brains/image";

type ImageDefinition = EntityDefinition<"image", typeof imageMetadataSchema>;
type ImageEntities = EntityJobHandleContext<unknown>["entities"];

/**
 * Save what a job made: over its pending placeholder when there is one,
 * else as a new image, as the entity plugin class's handlers saved it.
 */
export async function saveProcessedImage(
  entities: ImageEntities,
  image: ImageDefinition,
  id: string,
  made: { readonly content: string; readonly metadata: ImageMetadata },
): Promise<void> {
  const existing = await entities.get(image, id);
  if (existing) {
    await entities.update(image, existing, {
      content: made.content,
      metadata: made.metadata,
    });
    return;
  }
  await entities.create(image, {
    id,
    content: made.content,
    metadata: made.metadata,
  });
}

/**
 * Save staged image bytes: over the pending placeholder when there is one,
 * else as a new image, the bytes published with the record.
 */
export async function saveStagedImage(
  assets: EntityRuntimeAssets,
  image: ImageDefinition,
  id: string,
  staged: StagedImageEntity,
): Promise<void> {
  await assets.save(
    image,
    id,
    { metadata: staged.entity.metadata },
    staged.stagedAsset,
  );
}

/**
 * Mark a pending image failed, keeping it so the failure can be seen and
 * retried; an image that is not there is left alone. It is read as stored,
 * so no bytes are loaded and none are written back.
 */
export async function failPendingImage(
  entities: ImageEntities,
  assets: EntityRuntimeAssets,
  image: ImageDefinition,
  id: string,
  error: string,
): Promise<void> {
  const existing = await assets.getStored(image, id);
  if (!existing) return;
  await entities.update(image, existing, {
    metadata: {
      ...existing.metadata,
      status: "failed",
      processingError: error,
    },
  });
}
