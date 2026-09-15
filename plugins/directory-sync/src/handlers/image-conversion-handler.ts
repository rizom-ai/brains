import { readFile, writeFile } from "fs/promises";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { BaseJobHandler } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils/progress";
import { imageAdapter, imageAssetFactsSchema } from "@brains/image";
import { createAssetRef } from "@brains/assets";
import { getErrorMessage } from "@brains/utils/error";
import { parseMarkdown, generateMarkdown } from "@brains/utils/markdown";
import { PROGRESS_STEPS, JobResult } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { coverImageConversionJobSchema } from "../types";
import type { CoverImageConversionJobData } from "../types";

/**
 * Schema for cover image conversion job data.
 * Alias the canonical schema from types.ts for backward-compatible imports.
 */
export const coverImageConversionJobDataSchema: typeof coverImageConversionJobSchema =
  coverImageConversionJobSchema;
export type { CoverImageConversionJobData };

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

export interface ImageConversionResult {
  success: boolean;
  imageId?: string;
  skipped?: boolean;
  error?: string;
}

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

  constructor(context: ServicePluginContext, logger: Logger) {
    super(logger, {
      schema: coverImageConversionJobDataSchema,
      jobTypeName: "cover-image-convert",
    });
    this.context = context;
  }

  async process(
    data: CoverImageConversionJobData,
    jobId: string,
    progressReporter: ProgressReporter,
    signal?: AbortSignal,
  ): Promise<ImageConversionResult> {
    signal?.throwIfAborted();
    const { filePath, sourceUrl, postTitle, postSlug, customAlt } = data;

    this.logger.debug("Starting image conversion job", {
      jobId,
      filePath,
      sourceUrl,
      postSlug,
    });

    try {
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.INIT,
        message: `Reading file: ${filePath}`,
      });

      // Step 1: Re-read the file (may have changed since job was queued)
      let fileContent: string;
      try {
        fileContent = await readFile(filePath, "utf-8");
      } catch (error) {
        this.logger.error("Failed to read file", {
          filePath,
          error: getErrorMessage(error),
        });
        return JobResult.failure(error);
      }

      // Step 2: Parse and check if already converted
      let parsed;
      try {
        parsed = parseMarkdown(fileContent);
      } catch (error) {
        this.logger.warn("Failed to parse markdown", {
          filePath,
          error: getErrorMessage(error),
        });
        return JobResult.failure(error);
      }

      const frontmatterParsed = frontmatterRecordSchema.safeParse(
        parsed.frontmatter,
      );
      const frontmatter = frontmatterParsed.success
        ? frontmatterParsed.data
        : {};

      // Skip if already has coverImageId
      if (frontmatter["coverImageId"]) {
        this.logger.debug("File already has coverImageId, skipping", {
          filePath,
        });
        await this.reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.COMPLETE,
          message: "Already converted",
        });
        return { success: true, skipped: true };
      }

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.FETCH,
        message: "Checking for existing image",
      });

      // Step 3: Check for existing image with this sourceUrl (deduplication)
      const existing = await this.context.entityService.listEntities({
        entityType: "image",
        options: {
          filter: { metadata: { sourceUrl } },
          limit: 1,
        },
      });

      signal?.throwIfAborted();
      let imageId: string;

      if (existing[0]) {
        // Reuse existing image
        imageId = existing[0].id;
        this.logger.debug("Reusing existing image entity", {
          sourceUrl,
          imageId,
        });
        await this.reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.EXTRACT,
          message: `Reusing existing image: ${imageId}`,
        });
      } else {
        // Step 4: Fetch image from URL
        await this.reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.PROCESS,
          message: `Fetching image from ${sourceUrl}`,
        });

        const files = this.context.entityService.fileAssets;
        if (!files?.withRemoteFile)
          throw new Error("Remote image file ingress is not provisioned");
        imageId = `${postSlug}-cover`;
        const imageTitle = `Cover image for ${postTitle}`;
        await files.withRemoteFile(
          sourceUrl,
          async (file, transferSignal): Promise<void> => {
            const facts = imageAssetFactsSchema.parse({
              ...file.details,
              ref: createAssetRef(file.sha256),
              digest: file.sha256,
              sizeBytes: file.sizeBytes,
            });
            const imageData = imageAdapter.createImageEntity({
              facts,
              title: imageTitle,
              alt: customAlt ?? imageTitle,
              sourceUrl,
            });
            await files.publish(
              {
                sourceFile: file.sourceFile,
                sizeBytes: file.sizeBytes,
                publication: {
                  operation: "createEntity",
                  request: { entity: { id: imageId, ...imageData } },
                },
              },
              { signal: transferSignal },
            );
          },
          { signal },
        );

        this.logger.debug("Created image entity", { imageId, sourceUrl });

        await this.reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.EXTRACT,
          message: `Created image: ${imageId}`,
        });
      }

      signal?.throwIfAborted();
      // Step 6: Update frontmatter
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.SAVE,
        message: "Updating file",
      });

      const newFrontmatter = { ...frontmatter };
      delete newFrontmatter["coverImageUrl"];
      delete newFrontmatter["coverImageAlt"];
      newFrontmatter["coverImageId"] = imageId;

      const updatedContent = generateMarkdown(newFrontmatter, parsed.content);

      try {
        await writeFile(filePath, updatedContent, "utf-8");
      } catch (error) {
        this.logger.error("Failed to write file", {
          filePath,
          error: getErrorMessage(error),
        });
        return JobResult.failure(error);
      }

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.COMPLETE,
        message: "Conversion complete",
      });

      this.logger.info("Image conversion complete", {
        filePath,
        imageId,
        sourceUrl,
      });

      return { success: true, imageId };
    } catch (error) {
      this.logger.error("Image conversion job failed", {
        jobId,
        filePath,
        error: getErrorMessage(error),
      });
      return JobResult.failure(error);
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
