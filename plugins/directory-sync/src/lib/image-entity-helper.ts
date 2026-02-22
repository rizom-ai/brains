import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import {
  parseDataUrl,
  detectImageFormat,
  detectImageDimensions,
} from "@brains/image";
import type { ImageFetcher } from "./frontmatter-image-converter";

interface ImageEntityParams {
  id: string;
  title: string;
  alt: string;
  sourceUrl: string;
}

/**
 * Find an existing image entity by sourceUrl, or fetch + create a new one.
 * Shared by FrontmatterImageConverter and MarkdownImageConverter.
 */
export async function getOrCreateImageEntity(
  params: ImageEntityParams,
  entityService: IEntityService,
  fetcher: ImageFetcher,
  logger: Logger,
): Promise<string> {
  const { sourceUrl } = params;

  // Check for existing image with this sourceUrl (deduplication)
  const existing = await entityService.listEntities("image", {
    filter: { metadata: { sourceUrl } },
    limit: 1,
  });

  if (existing[0]) {
    logger.debug("Reusing existing image entity", {
      sourceUrl,
      imageId: existing[0].id,
    });
    return existing[0].id;
  }

  const dataUrl = await fetcher(sourceUrl);

  const { base64 } = parseDataUrl(dataUrl);
  const format = detectImageFormat(base64);
  const dimensions = detectImageDimensions(base64);

  if (!format || !dimensions) {
    throw new Error("Could not detect image format or dimensions");
  }

  const result = await entityService.createEntity({
    id: params.id,
    entityType: "image",
    content: dataUrl,
    metadata: {
      title: params.title,
      alt: params.alt,
      format,
      width: dimensions.width,
      height: dimensions.height,
      sourceUrl,
    },
  });

  logger.debug("Created image entity from URL", {
    sourceUrl,
    imageId: result.entityId,
  });

  return result.entityId;
}
