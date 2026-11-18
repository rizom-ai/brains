import { writeOnCurrent } from "@brains/utils/write-on-current";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import type { ServiceEntityWrites } from "@brains/sdk/internal/service-runtime";

/**
 * Set an image entity as the cover image on a target entity.
 *
 * Returns true when the cover was set, false when the target entity
 * does not exist.
 */
/**
 * The entity reads and writes stock-photo performs.
 *
 * The entity service is a large surface; asking for all of it meant a test could
 * not supply three methods without asserting it was the whole service.
 */
export interface StockPhotoEntityWriter extends Pick<
  ServiceEntityWrites,
  "createEntity" | "updateEntity" | "stageAsset" | "discardStagedAsset"
> {
  getEntity(request: {
    entityType: string;
    id: string;
  }): Promise<BaseEntity | null>;
}

export async function setCoverImage(
  entityService: StockPhotoEntityWriter,
  entityType: string,
  entityId: string,
  imageEntityId: string,
): Promise<boolean> {
  // Over the version read only: an edit made meanwhile keeps its text and
  // gets the cover set on top of it.
  const outcome = await writeOnCurrent({
    read: () => entityService.getEntity({ entityType, id: entityId }),
    change: (target) => ({
      ...target,
      metadata: { ...target.metadata, coverImageId: imageEntityId },
    }),
    write: (entity, expectedContentHash) =>
      entityService.updateEntity({ entity, options: { expectedContentHash } }),
  });
  return outcome === "written";
}
