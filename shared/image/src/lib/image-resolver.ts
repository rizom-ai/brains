import type { ICoreEntityService, BaseEntity } from "@brains/entity-service";
import { fromYaml, updateFrontmatterField } from "@brains/utils";
import type { Image, ResolvedImage } from "../schemas/image";

// Matches the leading `---\n…\n---` frontmatter block. Capture group 1 is
// the inner YAML, so callers can parse just that slice and skip the body.
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

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
  const image = await entityService.getEntity<Image>({
    entityType: "image",
    id: imageId,
  });

  if (!image) {
    return null;
  }

  return {
    url: image.content,
    alt: image.metadata.alt ?? "",
    title: image.metadata.title ?? "",
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
export function extractCoverImageId(entity: {
  content: string;
}): string | undefined {
  const match = FRONTMATTER_BLOCK.exec(entity.content);
  if (!match?.[1]) return undefined;
  try {
    const parsed = fromYaml<unknown>(match[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const value = (parsed as Record<string, unknown>)["coverImageId"];
      return typeof value === "string" ? value : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function setCoverImageId<T extends { content: string }>(
  entity: T,
  imageId: string | null,
): T {
  return {
    ...entity,
    content: updateFrontmatterField(entity.content, "coverImageId", imageId),
  };
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
