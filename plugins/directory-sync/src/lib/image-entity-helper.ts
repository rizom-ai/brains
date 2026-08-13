import type { IAssetsNamespace, IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { inspectImageBytes, parseDataUrl } from "@brains/image";

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
  entityService: IEntityService,
  assets: IAssetsNamespace,
  fetcher: ImageFetcher,
  logger: Logger,
): Promise<string> {
  const { sourceUrl } = params;

  // Check for existing image with this sourceUrl (deduplication)
  const existing = await entityService.listEntities({
    entityType: "image",
    binaryContent: "reference",
    binaryContentSurface: "directory-sync-remote-image-dedup",
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
  const parsed = parseDataUrl(dataUrl);
  const inspected = inspectImageBytes(parsed.bytes, parsed.mediaType);
  const stored = await assets.put(parsed.bytes);

  const result = await entityService.createEntity({
    entity: {
      id: params.id,
      entityType: "image",
      content: stored.ref,
      metadata: {
        title: params.title,
        alt: params.alt,
        format: inspected.format,
        mediaType: inspected.mediaType,
        sizeBytes: stored.sizeBytes,
        width: inspected.width,
        height: inspected.height,
        sourceUrl,
      },
    },
  });

  logger.debug("Created image entity from URL", {
    sourceUrl,
    imageId: result.entityId,
  });

  return result.entityId;
}
