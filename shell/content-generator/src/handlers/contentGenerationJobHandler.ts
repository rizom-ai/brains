import { z } from "zod";
import type { ContentGenerationRequest } from "@brains/db";
import { Logger } from "@brains/utils";
import type { ContentGenerator } from "@brains/content-generator";
import type { JobHandler } from "@brains/job-queue";

/**
 * Zod schema for content generation job data validation
 */
const contentGenerationJobDataSchema = z.object({
  templateName: z.string().min(1, "Template name is required"),
  context: z.object({
    prompt: z.string().optional(),
    data: z.record(z.unknown()).optional(),
  }),
  userId: z.string().optional(),
});

/**
 * Job handler for content generation
 * Processes content generation requests using the ContentGenerator service
 * Implements Component Interface Standardization pattern
 */
export class ContentGenerationJobHandler
  implements JobHandler<"content-generation">
{
  private static instance: ContentGenerationJobHandler | null = null;
  private logger: Logger;
  private contentGenerator: ContentGenerator;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    contentGenerator: ContentGenerator,
  ): ContentGenerationJobHandler {
    ContentGenerationJobHandler.instance ??= new ContentGenerationJobHandler(
      contentGenerator,
    );
    return ContentGenerationJobHandler.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    ContentGenerationJobHandler.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    contentGenerator: ContentGenerator,
  ): ContentGenerationJobHandler {
    return new ContentGenerationJobHandler(contentGenerator);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(contentGenerator: ContentGenerator) {
    this.logger = Logger.getInstance().child("ContentGenerationJobHandler");
    this.contentGenerator = contentGenerator;
  }

  /**
   * Process a content generation job
   * Generates content using the specified template and context
   */
  public async process(
    data: ContentGenerationRequest,
    jobId: string,
  ): Promise<string> {
    try {
      this.logger.debug("Processing content generation job", {
        jobId,
        templateName: data.templateName,
        hasPrompt: !!data.context.prompt,
        hasData: !!data.context.data,
        userId: data.userId,
      });

      // Generate content using the ContentGenerator service
      const content = await this.contentGenerator.generateContent<unknown>(
        data.templateName,
        data.context,
      );

      // Format the content to string using the template's formatter
      const formattedContent = this.contentGenerator.formatContent(
        data.templateName,
        content,
      );

      this.logger.debug("Content generation job completed successfully", {
        jobId,
        templateName: data.templateName,
        contentLength: formattedContent.length,
      });

      return formattedContent;
    } catch (error) {
      this.logger.error("Content generation job failed", {
        jobId,
        templateName: data.templateName,
        userId: data.userId,
        error,
      });
      throw error;
    }
  }

  /**
   * Handle content generation job errors
   * Provides additional logging and context for debugging
   */
  public async onError(
    error: Error,
    data: ContentGenerationRequest,
    jobId: string,
  ): Promise<void> {
    this.logger.error("Content generation job error handler called", {
      jobId,
      templateName: data.templateName,
      userId: data.userId,
      hasPrompt: !!data.context.prompt,
      hasData: !!data.context.data,
      errorMessage: error.message,
      errorStack: error.stack,
    });

    // Could add additional error handling here:
    // - Notify user of failed content generation
    // - Send alerts for critical templates
    // - Store error details for analysis
    // - Retry with different parameters
  }

  /**
   * Validate and parse content generation job data using Zod schema
   * Ensures type safety and data integrity
   */
  public validateAndParse(data: unknown): ContentGenerationRequest | null {
    try {
      const result = contentGenerationJobDataSchema.parse(data);

      this.logger.debug("Content generation job data validation successful", {
        templateName: result.templateName,
        hasPrompt: !!result.context.prompt,
        hasData: !!result.context.data,
        userId: result.userId,
      });

      return result;
    } catch (error) {
      this.logger.warn("Invalid content generation job data", {
        data,
        validationError: error instanceof z.ZodError ? error.errors : error,
      });
      return null;
    }
  }
}
