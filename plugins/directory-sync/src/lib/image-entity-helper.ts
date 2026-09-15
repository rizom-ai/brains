import type { EntityServiceClient } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { imageAdapter, imageAssetFactsSchema } from "@brains/image";
import { createAssetRef } from "@brains/assets";

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
  logger: Logger,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const { sourceUrl } = params;

  // Check for existing image with this sourceUrl (deduplication)
  const existing = await entityService.listEntities({
    entityType: "image",
    options: {
      filter: { metadata: { sourceUrl } },
      limit: 1,
    },
  });

  signal?.throwIfAborted();
  if (existing[0]) {
    logger.debug("Reusing existing image entity", {
      sourceUrl,
      imageId: existing[0].id,
    });
    return existing[0].id;
  }

  const files = entityService.fileAssets;
  if (!files?.withRemoteFile)
    throw new Error("Remote image file ingress is not provisioned");
  const result = await files.withRemoteFile(
    sourceUrl,
    async (file, transferSignal): ReturnType<typeof files.publish> => {
      const facts = imageAssetFactsSchema.parse({
        ...file.details,
        ref: createAssetRef(file.sha256),
        digest: file.sha256,
        sizeBytes: file.sizeBytes,
      });
      const imageData = imageAdapter.createImageEntity({
        facts,
        title: params.title,
        alt: params.alt,
        sourceUrl,
      });
      return files.publish(
        {
          sourceFile: file.sourceFile,
          sizeBytes: file.sizeBytes,
          publication: {
            operation: "createEntity",
            request: { entity: { id: params.id, ...imageData } },
          },
        },
        { signal: transferSignal },
      );
    },
    { signal },
  );

  logger.debug("Created image entity from URL", {
    sourceUrl,
    imageId: result.entityId,
  });

  return result.entityId;
}
