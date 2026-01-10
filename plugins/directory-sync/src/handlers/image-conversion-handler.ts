import { readFileSync, writeFileSync } from "fs";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { BaseJobHandler } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import {
  z,
  fetchImageAsBase64,
  parseMarkdown,
  generateMarkdown,
} from "@brains/utils";
import {
  parseDataUrl,
  detectImageFormat,
  detectImageDimensions,
} from "@brains/image";

/**
 * Schema for cover image conversion job data
 */
export const coverImageConversionJobDataSchema = z.object({
  /** Path to the markdown file to update */
  filePath: z.string(),
  /** URL of the image to fetch */
  sourceUrl: z.string().url(),
  /** Title of the post (used for image title/alt) */
  postTitle: z.string(),
  /** Slug of the post (used for image ID) */
  postSlug: z.string(),
  /** Optional custom alt text */
  customAlt: z.string().optional(),
});

export type CoverImageConversionJobData = z.infer<
  typeof coverImageConversionJobDataSchema
>;

interface ImageConversionResult {
  success: boolean;
  imageId?: string;
  skipped?: boolean;
  error?: string;
}

/** Function to fetch an image URL and return base64 data URL */
export type ImageFetcher = (url: string) => Promise<string>;

/**
 * Job handler for converting coverImageUrl to coverImageId in markdown files
 *
 * This runs asynchronously so entity imports aren't blocked by image fetching.
 * The handler:
 * 1. Re-reads the file (may have changed since job was queued)
 * 2. Checks if already converted (skip if coverImageId exists)
 * 3. Checks for existing image by sourceUrl (deduplication)
 * 4. Fetches image from URL
 * 5. Creates image entity
 * 6. Updates file frontmatter (coverImageUrl → coverImageId)
 */
export class CoverImageConversionJobHandler extends BaseJobHandler<
  "cover-image-convert",
  CoverImageConversionJobData,
  ImageConversionResult
> {
  private readonly context: ServicePluginContext;
  private readonly fetcher: ImageFetcher;

  constructor(
    context: ServicePluginContext,
    logger: Logger,
    fetcher: ImageFetcher = fetchImageAsBase64,
  ) {
    super(logger, {
      schema: coverImageConversionJobDataSchema,
      jobTypeName: "cover-image-convert",
    });
    this.context = context;
    this.fetcher = fetcher;
  }

  async process(
    data: CoverImageConversionJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<ImageConversionResult> {
    const { filePath, sourceUrl, postTitle, postSlug, customAlt } = data;

    this.logger.debug("Starting image conversion job", {
      jobId,
      filePath,
      sourceUrl,
      postSlug,
    });

    try {
      await this.reportProgress(progressReporter, {
        progress: 10,
        message: `Reading file: ${filePath}`,
      });

      // Step 1: Re-read the file (may have changed since job was queued)
      let fileContent: string;
      try {
        fileContent = readFileSync(filePath, "utf-8");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error("Failed to read file", { filePath, error: message });
        return { success: false, error: message };
      }

      // Step 2: Parse and check if already converted
      let parsed;
      try {
        parsed = parseMarkdown(fileContent);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn("Failed to parse markdown", {
          filePath,
          error: message,
        });
        return { success: false, error: message };
      }

      const frontmatter = parsed.frontmatter as Record<string, unknown>;

      // Skip if already has coverImageId
      if (frontmatter["coverImageId"]) {
        this.logger.debug("File already has coverImageId, skipping", {
          filePath,
        });
        await this.reportProgress(progressReporter, {
          progress: 100,
          message: "Already converted",
        });
        return { success: true, skipped: true };
      }

      await this.reportProgress(progressReporter, {
        progress: 20,
        message: "Checking for existing image",
      });

      // Step 3: Check for existing image with this sourceUrl (deduplication)
      const existing = await this.context.entityService.listEntities("image", {
        filter: { metadata: { sourceUrl } },
        limit: 1,
      });

      let imageId: string;

      if (existing[0]) {
        // Reuse existing image
        imageId = existing[0].id;
        this.logger.debug("Reusing existing image entity", {
          sourceUrl,
          imageId,
        });
        await this.reportProgress(progressReporter, {
          progress: 70,
          message: `Reusing existing image: ${imageId}`,
        });
      } else {
        // Step 4: Fetch image from URL
        await this.reportProgress(progressReporter, {
          progress: 30,
          message: `Fetching image from ${sourceUrl}`,
        });

        let dataUrl: string;
        try {
          dataUrl = await this.fetcher(sourceUrl);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error("Failed to fetch image", {
            sourceUrl,
            error: message,
          });
          return { success: false, error: message };
        }

        await this.reportProgress(progressReporter, {
          progress: 50,
          message: "Creating image entity",
        });

        // Extract format and dimensions
        const { base64 } = parseDataUrl(dataUrl);
        const format = detectImageFormat(base64);
        const dimensions = detectImageDimensions(base64);

        if (!format || !dimensions) {
          const message = "Could not detect image format or dimensions";
          this.logger.error(message, { sourceUrl });
          return { success: false, error: message };
        }

        // Step 5: Create image entity
        imageId = `${postSlug}-cover`;
        const imageTitle = `Cover image for ${postTitle}`;
        const imageAlt = customAlt ?? imageTitle;

        await this.context.entityService.createEntity({
          id: imageId,
          entityType: "image",
          content: dataUrl,
          metadata: {
            title: imageTitle,
            alt: imageAlt,
            format,
            width: dimensions.width,
            height: dimensions.height,
            sourceUrl,
          },
        });

        this.logger.debug("Created image entity", { imageId, sourceUrl });

        await this.reportProgress(progressReporter, {
          progress: 70,
          message: `Created image: ${imageId}`,
        });
      }

      // Step 6: Update frontmatter
      await this.reportProgress(progressReporter, {
        progress: 80,
        message: "Updating file",
      });

      const newFrontmatter = { ...frontmatter };
      delete newFrontmatter["coverImageUrl"];
      delete newFrontmatter["coverImageAlt"];
      newFrontmatter["coverImageId"] = imageId;

      const updatedContent = generateMarkdown(newFrontmatter, parsed.content);

      try {
        writeFileSync(filePath, updatedContent, "utf-8");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error("Failed to write file", { filePath, error: message });
        return { success: false, error: message };
      }

      await this.reportProgress(progressReporter, {
        progress: 100,
        message: "Conversion complete",
      });

      this.logger.info("Image conversion complete", {
        filePath,
        imageId,
        sourceUrl,
      });

      return { success: true, imageId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Image conversion job failed", {
        jobId,
        filePath,
        error: message,
      });
      return { success: false, error: message };
    }
  }

  protected override summarizeDataForLog(
    data: CoverImageConversionJobData,
  ): Record<string, unknown> {
    return {
      filePath: data.filePath,
      sourceUrl: data.sourceUrl,
      postSlug: data.postSlug,
    };
  }
}
