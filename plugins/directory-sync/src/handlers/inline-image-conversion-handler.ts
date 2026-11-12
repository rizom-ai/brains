import type { DirectorySyncCore } from "../lib/sync-context";
import { readFile } from "fs/promises";
import { writeFileAtomic } from "../lib/atomic-write";
import type { Logger } from "@brains/utils/logger";
import { reportProgress } from "../lib/report-progress";
import type { ProgressReporter } from "@brains/utils/progress";
import { fetchImageAsBase64 } from "@brains/image";
import { getErrorMessage } from "@brains/utils/error";
import { PROGRESS_STEPS } from "@brains/contracts";
import { inlineImageConversionJobSchema } from "../types";
import type { InlineImageConversionJobData } from "../types";
import { MarkdownImageConverter } from "../lib/markdown-image-converter";
import type { ImageFetcher } from "../lib/frontmatter-image-converter";

export interface InlineImageConversionResult {
  success: boolean;
  convertedCount?: number;
  skipped?: boolean;
  error?: string;
}

/**
 * Job handler for converting inline HTTP image URLs to entity references
 *
 * This runs asynchronously so entity imports aren't blocked by image fetching.
 * The handler:
 * 1. Re-reads the file (may have changed since job was queued)
 * 2. Detects inline HTTP image URLs (not in code blocks)
 * 3. For each image, fetches and creates entity (or reuses existing)
 * 4. Replaces URLs with entity://image/{id} references
 * 5. Writes updated content back to file
 */
export class InlineImageConversionJobHandler {
  /** The data the queue hands this job, as its schema parses it. */
  readonly schema: typeof inlineImageConversionJobSchema =
    inlineImageConversionJobSchema;
  private readonly logger: Logger;
  private readonly converter: MarkdownImageConverter;

  constructor(
    context: DirectorySyncCore,
    logger: Logger,
    fetcher: ImageFetcher = fetchImageAsBase64,
  ) {
    this.logger = logger;
    this.converter = new MarkdownImageConverter(
      context.entityService,
      logger,
      fetcher,
    );
  }

  async process(
    data: InlineImageConversionJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<InlineImageConversionResult> {
    const { filePath, postSlug } = data;

    this.logger.debug("Starting inline image conversion job", {
      jobId,
      filePath,
      postSlug,
    });

    try {
      await reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.INIT,
        message: `Reading file: ${filePath}`,
      });

      // Step 1: Re-read the file (may have changed since job was queued)
      let fileContent: string;
      try {
        fileContent = await readFile(filePath, "utf-8");
      } catch (error) {
        const message = getErrorMessage(error);
        this.logger.error("Failed to read file", { filePath, error: message });
        return { success: false, error: message };
      }

      await reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.FETCH,
        message: "Detecting inline images",
      });

      // Step 2: Detect inline images that need conversion
      const detections = this.converter.detectInlineImages(
        fileContent,
        postSlug,
      );

      if (detections.length === 0) {
        this.logger.debug("No inline images to convert", { filePath });
        await reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.COMPLETE,
          message: "No images to convert",
        });
        return { success: true, skipped: true, convertedCount: 0 };
      }

      this.logger.debug("Found inline images to convert", {
        filePath,
        count: detections.length,
      });

      await reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.PROCESS,
        message: `Converting ${detections.length} images`,
      });

      // Step 3: Convert images using the converter
      const result = await this.converter.convert(fileContent, postSlug);

      if (!result.converted) {
        this.logger.debug("No images were converted", { filePath });
        await reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.COMPLETE,
          message: "No images converted",
        });
        return { success: true, skipped: true, convertedCount: 0 };
      }

      await reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.SAVE,
        message: "Writing updated file",
      });

      // Step 4: Write updated content back to file
      try {
        await writeFileAtomic(filePath, result.content);
      } catch (error) {
        const message = getErrorMessage(error);
        this.logger.error("Failed to write file", { filePath, error: message });
        return { success: false, error: message };
      }

      await reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.COMPLETE,
        message: "Conversion complete",
      });

      this.logger.info("Inline image conversion complete", {
        filePath,
        convertedCount: result.convertedCount,
      });

      return { success: true, convertedCount: result.convertedCount };
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error("Inline image conversion job failed", {
        jobId,
        filePath,
        error: message,
      });
      return { success: false, error: message };
    }
  }

  public summarizeDataForLog(
    data: InlineImageConversionJobData,
  ): Record<string, unknown> {
    return {
      filePath: data.filePath,
      postSlug: data.postSlug,
    };
  }
}
