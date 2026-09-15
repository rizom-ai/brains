import type { IEntityService } from "@brains/plugins";

/**
 * Set an image entity as the cover image on a target entity.
 *
 * Returns true when the cover was set, false when the target entity
 * does not exist.
 */
/**
 * Stock-photo uses metadata reads/updates and an owned file capability.
 * It does not require buffered entity creation or the full entity service.
 */
export type StockPhotoEntityWriter = Pick<
  IEntityService,
  "fileAssets" | "getEntity" | "updateEntity"
>;

export class CoverImageUpdateCancelled extends Error {
  constructor(reason: unknown) {
    super("Cover image update cancelled before mutation admission", {
      cause: reason,
    });
  }
}

export async function setCoverImage(
  entityService: StockPhotoEntityWriter,
  entityType: string,
  entityId: string,
  imageEntityId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) throw new CoverImageUpdateCancelled(signal.reason);
  const target = await entityService.getEntity({
    entityType,
    id: entityId,
  });
  if (signal?.aborted) throw new CoverImageUpdateCancelled(signal.reason);
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
