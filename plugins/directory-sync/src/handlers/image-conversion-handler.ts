import { readFile, writeFile } from "fs/promises";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { BaseJobHandler } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils/progress";
import { getOrCreateImageEntity } from "../lib/image-entity-helper";
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

      // All directory URL callers share the same deduplication and verified publication path.
      const title = `Cover image for ${postTitle}`;
      const imageId = await getOrCreateImageEntity(
        { id: `${postSlug}-cover`, title, alt: customAlt ?? title, sourceUrl },
        this.context.entityService,
        this.logger,
        signal,
      );

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
