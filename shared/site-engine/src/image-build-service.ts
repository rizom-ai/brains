import type { ImageRenderer } from "@brains/ui-library";
import type { Logger } from "@brains/utils/logger";
import { isErrnoException } from "@brains/utils/predicates";
import { mkdir, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ImageOptimizer } from "./image-optimizer";
import { imageSchema, imageAssetFactsSchema } from "@brains/image";
import {
  assetRefSchema,
  getAssetDigest,
  assetRecordSchema,
} from "@brains/assets";
import type {
  IEntityService,
  EntityFileAssets,
  EntityVerifiedFileSource,
} from "@brains/entity-service";
import type { ResolvedSiteImage, SiteImageMap } from "./site-image-contracts";
import { createSiteImageRenderer } from "./site-image-renderer";

export type ResolvedBuildImage = ResolvedSiteImage;
export type BuildImageMap = SiteImageMap;
type BuildImages = Pick<
  IEntityService,
  "getEntity" | "statAsset" | "fileAssets"
>;
class UnmigratedSiteImageError extends Error {}

/** Resolve entity images into native, verified static files before rendering.
 * Original URLs include the full asset digest: changed content never overwrites
 * an existing published image. Paths/cache names are not verification authority.
 */
export class ImageBuildService {
  private readonly entityService: BuildImages;
  private readonly logger: Logger;
  private readonly imageMap: BuildImageMap = {};
  private readonly imagesDir: string;
  constructor(entityService: BuildImages, logger: Logger, imagesDir: string) {
    this.entityService = entityService;
    this.logger = logger.child("ImageBuildService");
    this.imagesDir = resolve(imagesDir);
  }
  async resolveAll(imageIds: string[], signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const uniqueIds = [...new Set(imageIds)];
    if (uniqueIds.length === 0) return;
    const files = this.entityService.fileAssets;
    if (!files)
      throw new Error("Site image file processing is not provisioned");
    await mkdir(this.imagesDir, { recursive: true });
    const optimizer = new ImageOptimizer(this.imagesDir, this.logger, files);
    // One bulk producer per existing owner. All actor/consumer outcomes are
    // joined serially rather than parked behind another concurrency pool.
    for (const imageId of uniqueIds) {
      signal.throwIfAborted();
      try {
        await this.resolveImage(imageId, files, optimizer, signal);
      } catch (error) {
        if (signal.aborted || error instanceof UnmigratedSiteImageError)
          throw error;
        this.logger.warn("Failed to resolve image", { imageId, error });
      }
    }
    signal.throwIfAborted();
    this.logger.debug(
      `Resolved ${Object.keys(this.imageMap).length}/${uniqueIds.length} images`,
    );
  }
  private async resolveImage(
    imageId: string,
    files: EntityFileAssets,
    optimizer: ImageOptimizer,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const entity = await this.entityService.getEntity({
      entityType: "image",
      id: imageId,
    });
    signal.throwIfAborted();
    if (!entity?.content) {
      this.logger.warn("Image entity not found or has no content", { imageId });
      return;
    }
    const image = imageSchema.parse(entity);
    const parsed = assetRefSchema.safeParse(image.content.trim());
    if (!parsed.success)
      throw new UnmigratedSiteImageError(
        "Inline site images require asset migration before building",
      );
    const ref = parsed.data;
    if (!image.metadata.format)
      throw new Error("Site image requires an inspected format");
    const stat = await this.entityService.statAsset(ref);
    if (stat?.ref !== ref)
      throw new Error("Site image asset is missing or mismatched");
    const record = assetRecordSchema.parse({
      ...stat,
      digest: getAssetDigest(ref),
    });
    if (image.metadata.sizeBytes !== record.sizeBytes)
      throw new Error("Site image metadata does not match its asset size");
    // A model's MIME/dimensions and a digest-derived path are not inspection.
    // Validate the owned source before publishing even an unoptimized original.
    const inspected = await files.withAssetFile(
      ref,
      async (file, loanSignal) => {
        if (
          file.sha256 !== record.digest ||
          file.sizeBytes !== record.sizeBytes
        )
          throw new Error("Site image loan does not match its asset reference");
        const facts = await files.inspect(
          { sourceFile: file.sourceFile, sizeBytes: file.sizeBytes },
          { signal: loanSignal },
        );
        return imageAssetFactsSchema.parse({
          ...facts.details,
          ref,
          digest: facts.sha256,
          sizeBytes: facts.sizeBytes,
        });
      },
      { signal },
    );
    if (
      inspected.digest !== record.digest ||
      inspected.sizeBytes !== record.sizeBytes
    )
      throw new Error(
        "Site image inspection does not match its asset reference",
      );
    signal.throwIfAborted();
    const filename = `${record.digest}.${inspected.format}`;
    const sourceFile = join(this.imagesDir, filename);
    const input = { sourceFile, sizeBytes: record.sizeBytes };
    let exists = false;
    try {
      const info = await lstat(sourceFile);
      if (!info.isFile() || info.size !== record.sizeBytes)
        throw new Error("Site image output collision");
      exists = true;
    } catch (error) {
      if (!isErrnoException(error) || error.code !== "ENOENT") throw error;
    }
    const facts = exists
      ? await files.fingerprint(input, { signal })
      : await files.download({ ref, outputFile: sourceFile }, { signal });
    if (facts.sha256 !== record.digest || facts.sizeBytes !== record.sizeBytes)
      throw new Error("Site image file does not match its asset reference");
    signal.throwIfAborted();
    const source: EntityVerifiedFileSource = { ...input, sha256: facts.sha256 };
    const originalUrl = `/images/${filename}`;
    const variants = await optimizer.optimize(source, originalUrl, signal);
    signal.throwIfAborted();
    this.imageMap[imageId] = variants ?? {
      src: originalUrl,
      width: inspected.width,
      height: inspected.height,
    };
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
  createImageRenderer(): ImageRenderer {
    return createSiteImageRenderer(this.imageMap);
  }
}
