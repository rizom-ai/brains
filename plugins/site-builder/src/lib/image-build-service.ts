import type { Logger, ImageRenderer } from "@brains/utils";
import type { IEntityService } from "@brains/plugins";
import { promises as fs } from "fs";
import { join } from "path";
import { ImageOptimizer } from "./image-optimizer";

/** Image entity shape for getEntity calls */
interface ImageEntity {
  id: string;
  entityType: string;
  content: string;
  metadata: {
    format?: string;
    width?: number;
    height?: number;
  };
  created: string;
  updated: string;
  contentHash: string;
}

/**
 * Pre-resolved image ready for rendering.
 * Contains everything a component or markdown renderer needs.
 */
export interface ResolvedBuildImage {
  /** Static file URL (optimized WebP fallback, e.g. "/images/abc-960w.webp") */
  src: string;
  /** srcset string for responsive images, or undefined if not optimized */
  srcset?: string;
  /** sizes attribute, or undefined if not optimized */
  sizes?: string;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
}

/**
 * Map of image entity ID → resolved build image
 */
export type BuildImageMap = Record<string, ResolvedBuildImage>;

/**
 * Service that resolves all image entities to optimized static files
 * before rendering begins. This is the Astro-like approach: images are
 * processed during data preparation, not as HTML post-processing.
 *
 * Usage:
 *   const imageService = new ImageBuildService(outputDir, entityService, logger);
 *   await imageService.resolveAll(imageIds);
 *   const img = imageService.get("my-cover-image");
 *   // → { src: "/images/abc-960w.webp", srcset: "...", width: 960, height: 640 }
 */
export class ImageBuildService {
  private logger: Logger;
  private imageMap: BuildImageMap = {};
  private imagesDir: string;

  constructor(
    outputDir: string,
    private entityService: IEntityService,
    logger: Logger,
  ) {
    this.logger = logger.child("ImageBuildService");
    this.imagesDir = join(outputDir, "images");
  }

  /**
   * Resolve a batch of image entity IDs to optimized static files.
   * Call this once before rendering with all image IDs needed for the build.
   */
  async resolveAll(imageIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(imageIds)];
    if (uniqueIds.length === 0) return;

    await fs.mkdir(this.imagesDir, { recursive: true });

    const optimizer = new ImageOptimizer(this.imagesDir, this.logger);

    for (const imageId of uniqueIds) {
      try {
        const image = await this.entityService.getEntity<ImageEntity>(
          "image",
          imageId,
        );

        if (!image?.content) {
          this.logger.warn("Image entity not found or has no content", {
            imageId,
          });
          continue;
        }

        // Extract base64 data from data URL
        const base64Match = image.content.match(
          /^data:image\/[^;]+;base64,(.+)$/,
        );
        if (!base64Match?.[1]) {
          this.logger.warn("Could not extract base64 from image", { imageId });
          continue;
        }

        const buffer = Buffer.from(base64Match[1], "base64");

        // Write original file
        const format = this.detectFormat(image.metadata, image.content);
        const originalFileName = `${imageId}.${format}`;
        const originalFilePath = join(this.imagesDir, originalFileName);
        await fs.writeFile(originalFilePath, buffer);

        const originalUrl = `/images/${originalFileName}`;

        // Optimize → WebP variants
        const variants = await optimizer.optimize(buffer, originalUrl);

        if (variants) {
          this.imageMap[imageId] = {
            src: variants.src,
            srcset: variants.srcset,
            sizes: variants.sizes,
            width: variants.width,
            height: variants.height,
          };
        } else {
          // Optimization failed or image too small — use original
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
      } catch (error) {
        this.logger.warn("Failed to resolve image", {
          imageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.debug(
      `Resolved ${Object.keys(this.imageMap).length}/${uniqueIds.length} images`,
    );
  }

  /**
   * Get a resolved image by entity ID.
   * Returns undefined if the image wasn't resolved (missing, failed, etc.)
   */
  get(imageId: string): ResolvedBuildImage | undefined {
    return this.imageMap[imageId];
  }

  /**
   * Get the full image map (for passing to markdown renderers, etc.)
   */
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

      const attrs: string[] = [`src="${resolved.src}"`, `alt="${text}"`];
      if (resolved.srcset) attrs.push(`srcset="${resolved.srcset}"`);
      if (resolved.sizes) attrs.push(`sizes="${resolved.sizes}"`);
      if (resolved.width) attrs.push(`width="${resolved.width}"`);
      if (resolved.height) attrs.push(`height="${resolved.height}"`);
      if (title) attrs.push(`title="${title}"`);
      attrs.push('loading="lazy"');
      attrs.push('decoding="async"');

      return `<img ${attrs.join(" ")}>`;
    };
  }

  /**
   * Detect image format from metadata or data URL
   */
  private detectFormat(metadata: { format?: string }, dataUrl: string): string {
    if (metadata.format) return metadata.format;
    const match = dataUrl.match(/^data:image\/([^;]+);/);
    return match?.[1] ?? "png";
  }
}
