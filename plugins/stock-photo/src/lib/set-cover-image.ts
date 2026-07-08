import type { IEntityService } from "@brains/plugins";

/**
 * Set an image entity as the cover image on a target entity.
 *
 * Returns true when the cover was set, false when the target entity
 * does not exist.
 */
export async function setCoverImage(
  entityService: IEntityService,
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
