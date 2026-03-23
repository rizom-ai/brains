import type { Logger } from "@brains/utils";
import type { Dirent } from "fs";
import sharp from "sharp";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import { join } from "path";

/** Target widths for responsive variants (ascending) */
const VARIANT_WIDTHS = [480, 960, 1920] as const;

/** WebP quality setting (0-100) */
const WEBP_QUALITY = 80;

/** Default sizes attribute for responsive images */
const DEFAULT_SIZES =
  "(max-width: 640px) 480px, (max-width: 1280px) 960px, 1920px";

/**
 * Responsive image variant info for srcset rewriting
 */
export interface ImageVariants {
  /** Fallback src URL (960w WebP, or largest available) */
  src: string;
  /** Full srcset string, e.g. "/images/abc-480w.webp 480w, ..." */
  srcset: string;
  /** Recommended sizes attribute */
  sizes: string;
  /** Width of the fallback image */
  width: number;
  /** Height of the fallback image */
  height: number;
}

/**
 * Map of original image URL → responsive variant info
 * Key is the original URL (e.g. "/images/test-image.png")
 */
export type VariantsMap = Record<string, ImageVariants>;

/**
 * Optimizes images by converting to WebP and creating responsive size variants.
 *
 * Features:
 * - Converts PNG/JPEG to WebP at configurable quality
 * - Creates 480w, 960w, 1920w variants (skipping upscales)
 * - Filesystem cache: skips processing if output files already exist
 */
export class ImageOptimizer {
  private logger: Logger;

  constructor(
    private imagesDir: string,
    logger: Logger,
  ) {
    this.logger = logger.child("ImageOptimizer");
  }

  /**
   * Optimize a single image buffer, producing WebP variants on disk.
   *
   * @param buffer The raw image data
   * @param originalUrl The original image URL (used as the key in VariantsMap)
   * @returns Variant info for srcset, or null if optimization failed
   */
  async optimize(
    buffer: Buffer,
    originalUrl: string,
  ): Promise<ImageVariants | null> {
    try {
      const hash = createHash("sha256")
        .update(buffer)
        .digest("hex")
        .slice(0, 16);

      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) {
        this.logger.warn("Could not determine image dimensions", {
          originalUrl,
        });
        return null;
      }
      const sourceWidth = metadata.width;
      const sourceHeight = metadata.height;

      const variants: { width: number; url: string }[] = [];

      for (const targetWidth of VARIANT_WIDTHS) {
        // Don't upscale: skip widths larger than the source
        if (targetWidth > sourceWidth) continue;

        const fileName = `${hash}-${targetWidth}w.webp`;
        const filePath = join(this.imagesDir, fileName);
        const url = `/images/${fileName}`;

        // Filesystem cache: skip if output already exists
        const exists = await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false);

        if (exists) {
          this.logger.debug("Cache hit, skipping optimization", {
            fileName,
          });
          variants.push({ width: targetWidth, url });
          continue;
        }

        await sharp(buffer)
          .resize(targetWidth, null, { withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toFile(filePath);

        variants.push({ width: targetWidth, url });

        this.logger.debug("Created WebP variant", {
          fileName,
          width: targetWidth,
        });
      }

      if (variants.length === 0) {
        return null;
      }

      // Pick 960w as fallback, or the largest available variant
      const lastVariant = variants[variants.length - 1];
      if (!lastVariant) {
        return null;
      }
      const fallback = variants.find((v) => v.width === 960) ?? lastVariant;

      const fallbackHeight = Math.round(
        sourceHeight * (fallback.width / sourceWidth),
      );

      return {
        src: fallback.url,
        srcset: variants.map((v) => `${v.url} ${v.width}w`).join(", "),
        sizes: DEFAULT_SIZES,
        width: fallback.width,
        height: fallbackHeight,
      };
    } catch (error) {
      this.logger.warn("Image optimization failed, using original", {
        originalUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Optimize all image files in the images directory.
   *
   * Scans for PNG/JPEG files, creates WebP variants for each,
   * and returns a map of original URL → variant info.
   *
   * @returns Map of original image URLs to their responsive variants
   */
  async optimizeAll(): Promise<VariantsMap> {
    const variantsMap: VariantsMap = {};

    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.imagesDir, { withFileTypes: true });
    } catch {
      this.logger.debug("Images directory does not exist, nothing to optimize");
      return variantsMap;
    }

    const imageFiles = entries.filter(
      (e) => e.isFile() && /\.(png|jpe?g)$/i.test(e.name),
    );

    if (imageFiles.length === 0) {
      this.logger.debug("No PNG/JPEG images found to optimize");
      return variantsMap;
    }

    this.logger.debug(`Optimizing ${imageFiles.length} images`);

    for (const file of imageFiles) {
      const filePath = join(this.imagesDir, file.name);
      const originalUrl = `/images/${file.name}`;

      try {
        const buffer = await fs.readFile(filePath);
        const variants = await this.optimize(buffer, originalUrl);

        if (variants) {
          variantsMap[originalUrl] = variants;
        }
      } catch (error) {
        this.logger.warn("Failed to optimize image", {
          file: file.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.debug(
      `Optimized ${Object.keys(variantsMap).length}/${imageFiles.length} images`,
    );

    return variantsMap;
  }
}
