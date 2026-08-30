import type { ImageRenderer } from "@brains/ui-library";
import type { Logger } from "@brains/utils/logger";
import { pLimit } from "@brains/utils/p-limit";
import { promises as fs } from "fs";
import { join } from "path";
import { ImageOptimizer } from "./image-optimizer";
import { resolveImageBytes } from "@brains/image";
import type { IEntityService } from "@brains/entity-service";
import type { ResolvedSiteImage, SiteImageMap } from "./site-image-contracts";
import { createSiteImageRenderer } from "./site-image-renderer";
import { getErrorMessage } from "@brains/utils/error";

export type ResolvedBuildImage = ResolvedSiteImage;
export type BuildImageMap = SiteImageMap;

/**
 * Service that resolves all image entities to optimized static files
 * before rendering begins.
 *
 * Usage:
 *   const imageService = new ImageBuildService(outputDir, entityService, logger);
 *   await imageService.resolveAll(imageIds, signal);
 *   const img = imageService.get("my-cover-image");
 */
export class ImageBuildService {
  private entityService: Pick<IEntityService, "getEntity" | "readAsset">;
  private logger: Logger;
  private imageMap: BuildImageMap = {};
  private imagesDir: string;
  private optimizer: ImageOptimizer;

  constructor(
    entityService: Pick<IEntityService, "getEntity" | "readAsset">,
    logger: Logger,
    imagesDir: string,
  ) {
    this.entityService = entityService;
    this.logger = logger.child("ImageBuildService");
    this.imagesDir = imagesDir;
    this.optimizer = new ImageOptimizer(this.imagesDir, this.logger);
  }

  /**
   * Resolve a batch of image entity IDs to optimized static files.
   * Call this once before rendering with all image IDs needed for the build.
   */
  async resolveAll(imageIds: string[], signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const uniqueIds = [...new Set(imageIds)];
    if (uniqueIds.length === 0) return;

    await fs.mkdir(this.imagesDir, { recursive: true });

    const limit = pLimit(4);
    await Promise.allSettled(
      uniqueIds.map((imageId) =>
        limit(async () => {
          signal.throwIfAborted();
          try {
            await this.resolveImage(imageId, signal);
          } catch (error) {
            signal.throwIfAborted();
            this.logger.warn("Failed to resolve image", {
              imageId,
              error: getErrorMessage(error),
            });
          }
        }),
      ),
    );
    signal.throwIfAborted();

    this.logger.debug(
      `Resolved ${Object.keys(this.imageMap).length}/${uniqueIds.length} images`,
    );
  }

  private async resolveImage(
    imageId: string,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const image = await this.entityService.getEntity({
      entityType: "image",
      id: imageId,
    });
    signal.throwIfAborted();

    if (!image?.content) {
      this.logger.warn("Image entity not found or has no content", { imageId });
      return;
    }

    const resolved = await resolveImageBytes(image, this.entityService);
    const buffer = Buffer.from(resolved.bytes);

    const format =
      getImageFormatMetadata(image.metadata).format ?? resolved.format;
    const originalFileName = `${imageId}.${format}`;
    const originalFilePath = join(this.imagesDir, originalFileName);
    await fs.writeFile(originalFilePath, buffer, { signal });
    signal.throwIfAborted();

    const originalUrl = `/images/${originalFileName}`;
    const variants = await this.optimizer.optimize(buffer, originalUrl);
    signal.throwIfAborted();

    if (variants) {
      this.imageMap[imageId] = {
        src: variants.src,
        srcset: variants.srcset,
        sizes: variants.sizes,
        width: variants.width,
        height: variants.height,
      };
    } else {
      this.imageMap[imageId] = {
        src: originalUrl,
        width: getNumericMetadata(image.metadata, "width"),
        height: getNumericMetadata(image.metadata, "height"),
      };
    }

    this.logger.debug("Resolved image", {
      imageId,
      optimized: Boolean(variants),
    });
  }

  get(imageId: string): ResolvedBuildImage | undefined {
    return this.imageMap[imageId];
  }

  getMap(): BuildImageMap {
    return this.imageMap;
  }

  /**
   * Create an ImageRenderer callback for use with markdownToHtml().
   * Resolves entity://image/{id} references to optimized <img> tags with srcset.
   */
  createImageRenderer(): ImageRenderer {
    return createSiteImageRenderer(this.imageMap);
  }
}

function getImageFormatMetadata(metadata: Record<string, unknown>): {
  format?: string;
} {
  const format = metadata["format"];
  if (typeof format === "string") {
    return { format };
  }
  return {};
}

function getNumericMetadata(
  metadata: Record<string, unknown>,
  key: string,
): number {
  const value = metadata[key];
  if (typeof value === "number") {
    return value;
  }
  return 0;
}
