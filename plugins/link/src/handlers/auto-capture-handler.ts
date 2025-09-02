import type { JobHandler } from "@brains/job-queue";
import type { ProgressReporter } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils";
import type { Logger } from "@brains/utils";
import { LinkService } from "../lib/link-service";
import { UrlUtils } from "../lib/url-utils";

/**
 * Schema for auto-capture job data
 */
export const autoCaptureJobDataSchema = z.object({
  url: z.string().url(),
  metadata: z
    .object({
      conversationId: z.string().optional(),
      userId: z.string().optional(),
      messageId: z.string().optional(),
      timestamp: z.string().optional(),
    })
    .optional(),
});

export type AutoCaptureJobData = z.infer<typeof autoCaptureJobDataSchema>;

/**
 * Job handler for automatic link capture
 * Processes URLs extracted from messages and captures them with AI extraction
 */
export class AutoCaptureHandler
  implements JobHandler<"auto-capture", AutoCaptureJobData, string>
{
  private static instance: AutoCaptureHandler | null = null;
  private logger: Logger;
  private linkService: LinkService;

  /**
   * Get the singleton instance
   */
  public static getInstance(context: ServicePluginContext): AutoCaptureHandler {
    AutoCaptureHandler.instance ??= new AutoCaptureHandler(context);
    return AutoCaptureHandler.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    AutoCaptureHandler.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(context: ServicePluginContext): AutoCaptureHandler {
    return new AutoCaptureHandler(context);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(context: ServicePluginContext) {
    this.logger = context.logger.child("AutoCaptureHandler");
    this.linkService = new LinkService(context);
  }

  /**
   * Process an auto-capture job
   */
  public async process(
    data: AutoCaptureJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<string> {
    try {
      this.logger.debug("Processing auto-capture job", {
        jobId,
        url: data.url,
        hasMetadata: !!data.metadata,
      });

      // Report initial progress
      await progressReporter.report({
        progress: 10,
        message: `Capturing link: ${data.url}`,
      });

      // Generate deterministic entity ID
      const entityId = UrlUtils.generateEntityId(data.url);

      // Capture the link (will check for existing entity automatically)
      const captureOptions: Parameters<typeof this.linkService.captureLink>[1] =
        {
          id: entityId,
        };

      if (data.metadata) {
        captureOptions.metadata = data.metadata;
      }

      const result = await this.linkService.captureLink(
        data.url,
        captureOptions,
      );

      // Report completion
      await progressReporter.report({
        progress: 100,
        message: `Successfully captured: ${result.title}`,
      });

      this.logger.info("Auto-capture completed", {
        jobId,
        entityId: result.entityId,
        title: result.title,
        url: data.url,
      });

      return result.entityId;
    } catch (error) {
      this.logger.error("Auto-capture failed", {
        jobId,
        url: data.url,
        error,
      });
      throw error;
    }
  }

  /**
   * Handle job failure
   */
  public async onError(
    error: Error,
    data: AutoCaptureJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<void> {
    this.logger.error("Auto-capture job failed", {
      jobId,
      url: data.url,
      error: error.message,
    });

    await progressReporter.report({
      progress: 0,
      message: `Failed to capture link: ${error.message}`,
    });
  }

  /**
   * Validate and parse job data
   */
  public validateAndParse(data: unknown): AutoCaptureJobData | null {
    try {
      return autoCaptureJobDataSchema.parse(data);
    } catch (error) {
      this.logger.warn("Invalid auto-capture job data", { data, error });
      return null;
    }
  }
}
