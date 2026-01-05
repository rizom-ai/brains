import type { ICoreEntityService } from "@brains/entity-service";
import type { Image, ResolvedImage } from "../schemas/image";

/**
 * Resolve an image entity by ID and return display-ready data
 *
 * @param imageId - The image entity ID to resolve
 * @param entityService - Entity service for fetching the image
 * @returns ResolvedImage with url, alt, title, width, height - or null if not found
 */
export async function resolveImage(
  imageId: string,
  entityService: ICoreEntityService,
): Promise<ResolvedImage | null> {
  const image = await entityService.getEntity<Image>("image", imageId);

  if (!image) {
    return null;
  }

  return {
    url: image.content,
    alt: image.metadata.alt,
    title: image.metadata.title,
    width: image.metadata.width,
    height: image.metadata.height,
  };
}
