import type { EntityServiceClient } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { imageAdapter, parseDataUrl, prepareImageAsset } from "@brains/image";

/** Function to fetch an image URL and return base64 data URL */
export type ImageFetcher = (url: string) => Promise<string>;

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
  entityService: EntityServiceClient,
  fetcher: ImageFetcher,
  logger: Logger,
): Promise<string> {
  const { sourceUrl } = params;

  // Check for existing image with this sourceUrl (deduplication)
  const existing = await entityService.listEntities({
    entityType: "image",
    options: {
      filter: { metadata: { sourceUrl } },
      limit: 1,
    },
  });

  if (existing[0]) {
    logger.debug("Reusing existing image entity", {
      sourceUrl,
      imageId: existing[0].id,
    });
    return existing[0].id;
  }

  const dataUrl = await fetcher(sourceUrl);

  const parsedImage = parseDataUrl(dataUrl);
  const { asset: preparedAsset, facts } = prepareImageAsset(
    parsedImage.bytes,
    parsedImage.mediaType,
  );
  const imageData = imageAdapter.createImageEntity({
    facts,
    title: params.title,
    alt: params.alt,
    sourceUrl,
  });

  const result = await entityService.createEntity({
    entity: {
      id: params.id,
      ...imageData,
    },
    preparedAsset,
  });

  logger.debug("Created image entity from URL", {
    sourceUrl,
    imageId: result.entityId,
  });

  return result.entityId;
}
