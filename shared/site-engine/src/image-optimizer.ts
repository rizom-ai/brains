import type { Logger } from "@brains/utils/logger";
import { isErrnoException } from "@brains/utils/predicates";
import { readdir, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { optimizeImageFile } from "@brains/image";
import type {
  EntityFileAssets,
  EntityVerifiedFileSource,
} from "@brains/entity-service";

const DEFAULT_SIZES =
  "(max-width: 640px) 480px, (max-width: 1280px) 960px, 1920px";
export interface ImageVariants {
  src: string;
  srcset: string;
  sizes: string;
  width: number;
  height: number;
}
export type VariantsMap = Record<string, ImageVariants>;
export type ImageOptimizerFiles = Pick<
  EntityFileAssets,
  "withProducedFile" | "fingerprint"
>;

/** Metadata-only orchestration. Resizing, encoding, hashing and cache validation
 * run in the existing named producer owner; no controller SDK or byte fallback.
 */
export class ImageOptimizer {
  private readonly imagesDir: string;
  private readonly logger: Logger;
  private readonly files: ImageOptimizerFiles;
  constructor(imagesDir: string, logger: Logger, files: ImageOptimizerFiles) {
    this.imagesDir = resolve(imagesDir);
    this.logger = logger.child("ImageOptimizer");
    this.files = files;
  }
  async optimize(
    source: EntityVerifiedFileSource,
    originalUrl: string,
    signal: AbortSignal,
  ): Promise<ImageVariants | null> {
    signal.throwIfAborted();
    try {
      const manifest = await optimizeImageFile(
        this.files,
        source,
        this.imagesDir,
        { signal },
      );
      signal.throwIfAborted();
      const variants = manifest.variants;
      const fallback =
        variants.find((variant) => variant.width === 960) ?? variants.at(-1);
      if (!fallback) return null;
      return {
        src: `/images/${fallback.filename}`,
        srcset: variants
          .map((variant) => `/images/${variant.filename} ${variant.width}w`)
          .join(", "),
        sizes: DEFAULT_SIZES,
        width: fallback.width,
        height: fallback.height,
      };
    } catch (error) {
      if (signal.aborted) throw error;
      // Optimisation remains best-effort. The already verified original is the
      // fallback, not a controller-side buffer or an unjoined SDK operation.
      this.logger.warn("Image optimization failed, using original", {
        originalUrl,
        error,
      });
      return null;
    }
  }
  async optimizeAll(signal: AbortSignal): Promise<VariantsMap> {
    signal.throwIfAborted();
    const result: VariantsMap = {};
    let entries;
    try {
      entries = await readdir(this.imagesDir, { withFileTypes: true });
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return result;
      throw error;
    }
    // The runtime has one bulk producer. Do not introduce another fan-out pool.
    for (const entry of entries) {
      signal.throwIfAborted();
      if (!entry.isFile() || !/\.(png|jpe?g)$/i.test(entry.name)) continue;
      const sourceFile = join(this.imagesDir, entry.name);
      const url = `/images/${encodeURIComponent(entry.name)}`;
      try {
        const info = await lstat(sourceFile);
        const facts = await this.files.fingerprint(
          { sourceFile, sizeBytes: info.size },
          { signal },
        );
        signal.throwIfAborted();
        const variants = await this.optimize(
          { sourceFile, ...facts },
          url,
          signal,
        );
        if (variants) result[url] = variants;
      } catch (error) {
        if (signal.aborted) throw error;
        this.logger.warn("Failed to optimize image", {
          file: entry.name,
          error,
        });
      }
    }
    return result;
  }
}
