import type { ICoreEntityService, BaseEntity } from "@brains/entity-service";
import { parseMarkdownWithFrontmatter } from "@brains/entity-service";
import { z } from "@brains/utils";
import type { Image, ResolvedImage } from "../schemas/image";

// Generic schema that only extracts coverImageId from frontmatter
const coverImageFrontmatterSchema = z
  .object({
    coverImageId: z.string().optional(),
  })
  .passthrough();

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

/**
 * Extract coverImageId from entity content frontmatter
 *
 * This works for any entity type that stores coverImageId in YAML frontmatter.
 * No adapter-specific implementation needed.
 *
 * @param entity - The entity to extract coverImageId from
 * @returns The coverImageId string, or undefined if not found
 */
export function extractCoverImageId(entity: BaseEntity): string | undefined {
  try {
    const { metadata } = parseMarkdownWithFrontmatter(
      entity.content,
      coverImageFrontmatterSchema,
    );
    return metadata.coverImageId;
  } catch {
    return undefined;
  }
}

/**
 * Resolve cover image for any entity with coverImageId in frontmatter
 *
 * This utility provides a unified way to resolve cover images for any entity type.
 * It extracts coverImageId from the entity's YAML frontmatter and resolves it.
 * No adapter-specific implementation needed.
 *
 * @param entity - The entity to resolve cover image for
 * @param entityService - Entity service for fetching the image
 * @returns ResolvedImage with url, alt, title, width, height - or undefined if not found
 */
export async function resolveEntityCoverImage(
  entity: BaseEntity,
  entityService: ICoreEntityService,
): Promise<ResolvedImage | undefined> {
  const coverImageId = extractCoverImageId(entity);
  if (!coverImageId) {
    return undefined;
  }

  const resolved = await resolveImage(coverImageId, entityService);
  return resolved ?? undefined;
}
