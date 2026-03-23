import type { Logger, ImageRenderer } from "@brains/utils";
import { pLimit } from "@brains/utils";
import type { IEntityService } from "@brains/plugins";
import { promises as fs } from "fs";
import { join } from "path";
import { ImageOptimizer } from "./image-optimizer";
import {
  type ImageEntity,
  detectImageFormat,
  extractBase64,
  escapeHtmlAttr,
} from "./image-utils";

/**
 * Pre-resolved image ready for rendering.
 * Contains everything a component or markdown renderer needs.
 */
export interface ResolvedBuildImage {
  src: string;
  srcset?: string;
  sizes?: string;
  width: number;
  height: number;
}

export type BuildImageMap = Record<string, ResolvedBuildImage>;

/**
 * Service that resolves all image entities to optimized static files
 * before rendering begins.
 *
 * Usage:
 *   const imageService = new ImageBuildService(outputDir, entityService, logger);
 *   await imageService.resolveAll(imageIds);
 *   const img = imageService.get("my-cover-image");
 */
export class ImageBuildService {
  private logger: Logger;
  private imageMap: BuildImageMap = {};
  private imagesDir: string;
  private optimizer: ImageOptimizer;

  constructor(
    private entityService: IEntityService,
    logger: Logger,
    imagesDir: string,
  ) {
    this.logger = logger.child("ImageBuildService");
    this.imagesDir = imagesDir;
    this.optimizer = new ImageOptimizer(this.imagesDir, this.logger);
  }

  /**
   * Resolve a batch of image entity IDs to optimized static files.
   * Call this once before rendering with all image IDs needed for the build.
   */
  async resolveAll(imageIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(imageIds)];
    if (uniqueIds.length === 0) return;

    await fs.mkdir(this.imagesDir, { recursive: true });

    const limit = pLimit(4);
    await Promise.all(
      uniqueIds.map((imageId) =>
        limit(async () => {
          try {
            await this.resolveImage(imageId);
          } catch (error) {
            this.logger.warn("Failed to resolve image", {
              imageId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      ),
    );

    this.logger.debug(
      `Resolved ${Object.keys(this.imageMap).length}/${uniqueIds.length} images`,
    );
  }

  private async resolveImage(imageId: string): Promise<void> {
    const image = await this.entityService.getEntity<ImageEntity>(
      "image",
      imageId,
    );

    if (!image?.content) {
      this.logger.warn("Image entity not found or has no content", { imageId });
      return;
    }

    const base64 = extractBase64(image.content);
    if (!base64) {
      this.logger.warn("Could not extract base64 from image", { imageId });
      return;
    }

    const buffer = Buffer.from(base64, "base64");

    const format = detectImageFormat(image.metadata, image.content);
    const originalFileName = `${imageId}.${format}`;
    const originalFilePath = join(this.imagesDir, originalFileName);
    await fs.writeFile(originalFilePath, buffer);

    const originalUrl = `/images/${originalFileName}`;
    const variants = await this.optimizer.optimize(buffer, originalUrl);

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
        width: image.metadata.width ?? 0,
        height: image.metadata.height ?? 0,
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
    const imageMap = this.imageMap;
    return (
      href: string,
      title: string | null,
      text: string,
    ): string | undefined => {
      const entityMatch = /^entity:\/\/image\/(.+)$/.exec(href);
      if (!entityMatch?.[1]) return undefined;

      const resolved = imageMap[entityMatch[1]];
      if (!resolved) return undefined;

      const attrs: string[] = [
        `src="${escapeHtmlAttr(resolved.src)}"`,
        `alt="${escapeHtmlAttr(text)}"`,
      ];
      if (resolved.srcset)
        attrs.push(`srcset="${escapeHtmlAttr(resolved.srcset)}"`);
      if (resolved.sizes)
        attrs.push(`sizes="${escapeHtmlAttr(resolved.sizes)}"`);
      if (resolved.width) attrs.push(`width="${resolved.width}"`);
      if (resolved.height) attrs.push(`height="${resolved.height}"`);
      if (title) attrs.push(`title="${escapeHtmlAttr(title)}"`);
      attrs.push('loading="lazy"');
      attrs.push('decoding="async"');

      return `<img ${attrs.join(" ")}>`;
    };
  }
}
