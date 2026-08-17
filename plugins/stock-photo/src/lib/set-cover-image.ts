import type { IEntityService } from "@brains/plugins";

/**
 * Set an image entity as the cover image on a target entity.
 *
 * Returns true when the cover was set, false when the target entity
 * does not exist.
 */
/**
 * The entity reads and writes stock-photo performs.
 *
 * IEntityService is a large surface; asking for all of it meant a test could
 * not supply three methods without asserting it was the whole service.
 */
export type StockPhotoEntityWriter = Pick<
  IEntityService,
  "createEntity" | "getEntity" | "updateEntity"
>;

export async function setCoverImage(
  entityService: StockPhotoEntityWriter,
  entityType: string,
  entityId: string,
  imageEntityId: string,
): Promise<boolean> {
  const target = await entityService.getEntity({
    entityType,
    id: entityId,
  });
  if (!target) return false;

  await entityService.updateEntity({
    entity: {
      ...target,
      metadata: {
        ...target.metadata,
        coverImageId: imageEntityId,
      },
    },
  });
  return true;
}
