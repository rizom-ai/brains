import { z } from "zod";
// Remove ContentGenerationRequest import - we'll define our own schema
import { Logger } from "@brains/utils";
import type { ContentGenerator } from "@brains/content-generator";
import type { JobHandler } from "@brains/job-queue";
import type { EntityService } from "@brains/entity-service";
import type { ProgressReporter } from "@brains/utils";

/**
 * Zod schema for content generation job data validation
 */
export const contentGenerationJobDataSchema = z.object({
  templateName: z.string().min(1, "Template name is required"),
  context: z.object({
    prompt: z.string().optional(),
    data: z.record(z.unknown()).optional(),
    conversationId: z.string().default("system"),
  }),
  userId: z.string().optional(),
  // Entity information for saving generated content
  entityId: z.string(),
  entityType: z.string(),
});

export type ContentGenerationJobData = z.infer<
  typeof contentGenerationJobDataSchema
>;

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
  private entityService: EntityService;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    contentGenerator: ContentGenerator,
    entityService: EntityService,
  ): ContentGenerationJobHandler {
    ContentGenerationJobHandler.instance ??= new ContentGenerationJobHandler(
      contentGenerator,
      entityService,
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
    entityService: EntityService,
  ): ContentGenerationJobHandler {
    return new ContentGenerationJobHandler(contentGenerator, entityService);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    contentGenerator: ContentGenerator,
    entityService: EntityService,
  ) {
    this.logger = Logger.getInstance().child("ContentGenerationJobHandler");
    this.contentGenerator = contentGenerator;
    this.entityService = entityService;
  }

  /**
   * Process a content generation job
   * Generates content using the specified template and context
   */
  public async process(
    data: ContentGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<string> {
    try {
      this.logger.debug("Processing content generation job", {
        jobId,
        templateName: data.templateName,
        hasPrompt: !!data.context.prompt,
        hasData: !!data.context.data,
        userId: data.userId,
      });

      // Report initial progress
      await progressReporter.report({
        progress: 0,
        total: 3,
        message: `Generating content with template: ${data.templateName}`,
      });

      // TEMPORARY DEBUG: Add immediate progress report to test
      await progressReporter.report({
        progress: 0.5,
        total: 3,
        message: `DEBUG: About to start content generation...`,
      });

      // Generate content using the ContentGenerator service
      const content = await this.contentGenerator.generateContent<unknown>(
        data.templateName,
        {
          prompt: data.context.prompt,
          data: data.context.data,
          conversationId: data.context.conversationId || "system",
        },
      );

      // Report progress after content generation
      await progressReporter.report({
        progress: 1,
        total: 3,
        message: `Formatting content for template: ${data.templateName}`,
      });

      // Format the content to string using the template's formatter
      const formattedContent = this.contentGenerator.formatContent(
        data.templateName,
        content,
      );

      // Save the generated content as an entity if entityId and entityType are provided
      if (data.entityId && data.entityType) {
        const routeId = data.context.data?.["routeId"] as string | undefined;
        const sectionId = data.context.data?.["sectionId"] as
          | string
          | undefined;

        // Only save if we have the required metadata
        if (routeId && sectionId) {
          const newEntity = {
            id: data.entityId,
            entityType: data.entityType,
            content: formattedContent,
            routeId,
            sectionId,
          };

          await this.entityService.createEntity(newEntity);

          this.logger.debug("Saved generated content as entity", {
            jobId,
            entityId: data.entityId,
            entityType: data.entityType,
            routeId,
            sectionId,
          });
        } else {
          this.logger.warn("Cannot save entity without routeId and sectionId", {
            jobId,
            entityId: data.entityId,
            entityType: data.entityType,
            hasRouteId: !!routeId,
            hasSectionId: !!sectionId,
          });
        }
      }

      // Report completion
      await progressReporter.report({
        progress: 3,
        total: 3,
        message: `Completed content generation for: ${data.templateName}`,
      });

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
    data: ContentGenerationJobData,
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
  public validateAndParse(data: unknown): ContentGenerationJobData | null {
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
