import { z } from "zod";
import type {
  JobHandler,
  ServicePluginContext,
  ProgressReporter,
} from "@brains/plugins";

/**
 * Zod schema for site content generation job data
 */
export const siteContentGenerationJobDataSchema = z.object({
  routeId: z.string(),
  sectionId: z.string(),
  entityId: z.string(),
  entityType: z.literal("site-content-preview"),
  templateName: z.string(),
  context: z.object({
    prompt: z.string().optional(),
    data: z.record(z.unknown()).optional(),
  }),
  siteConfig: z.record(z.unknown()).optional(),
});

export type SiteContentGenerationJobData = z.infer<
  typeof siteContentGenerationJobDataSchema
>;

/**
 * Job handler for site-specific content generation
 */
export class SiteContentGenerationJobHandler
  implements JobHandler<"content-generation">
{
  constructor(private readonly context: ServicePluginContext) {}

  /**
   * Process a site content generation job
   */
  public async process(
    data: SiteContentGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<string> {
    const logger = this.context.logger.child("SiteContentGenerationJobHandler");

    try {
      logger.debug("Processing site content generation job", {
        jobId,
        routeId: data.routeId,
        sectionId: data.sectionId,
        templateName: data.templateName,
      });

      // Report initial progress
      await progressReporter.report({
        progress: 0,
        total: 3,
        message: `Generating content for ${data.routeId}:${data.sectionId}`,
      });

      // Check template capabilities first
      const capabilities = this.context.getTemplateCapabilities(
        data.templateName,
      );

      if (!capabilities) {
        logger.warn("Template not found", {
          jobId,
          templateName: data.templateName,
        });
        await progressReporter.report({
          progress: 3,
          total: 3,
          message: `Skipped ${data.routeId}:${data.sectionId} - template not found`,
        });
        return `[Template ${data.templateName} not found]`;
      }

      if (!capabilities.canGenerate) {
        logger.info("Template doesn't support generation, skipping", {
          jobId,
          templateName: data.templateName,
          capabilities,
        });
        await progressReporter.report({
          progress: 3,
          total: 3,
          message: `Skipped ${data.routeId}:${data.sectionId} - template doesn't support generation`,
        });
        return `[Template ${data.templateName} is ${
          capabilities.canFetch ? "fetch-only" : "static-only"
        }]`;
      }

      // Generate content using the template
      const generatedContent = await this.context.generateContent({
        prompt: data.context.prompt || "",
        templateName: data.templateName,
        ...(data.context.data && { data: data.context.data }),
      });

      // Format the generated content using the template's formatter
      const formattedContent = this.context.formatContent(
        data.templateName,
        generatedContent,
      );

      await progressReporter.report({
        progress: 2,
        total: 3,
        message: `Saving content for ${data.routeId}:${data.sectionId}`,
      });

      // Save the generated content as an entity
      const newEntity = {
        id: data.entityId,
        entityType: data.entityType,
        content: formattedContent,
        routeId: data.routeId,
        sectionId: data.sectionId,
      };

      await this.context.entityService.createEntity(newEntity);

      await progressReporter.report({
        progress: 3,
        total: 3,
        message: `Completed content generation for ${data.routeId}:${data.sectionId}`,
      });

      logger.debug("Site content generation job completed", {
        jobId,
        routeId: data.routeId,
        sectionId: data.sectionId,
        contentLength: formattedContent.length,
      });

      return formattedContent;
    } catch (error) {
      logger.error("Site content generation job failed", {
        jobId,
        routeId: data.routeId,
        sectionId: data.sectionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Validate and parse job data
   */
  public validateAndParse(data: unknown): SiteContentGenerationJobData | null {
    try {
      return siteContentGenerationJobDataSchema.parse(data);
    } catch (error) {
      this.context.logger.warn("Invalid site content generation job data", {
        data,
        error,
      });
      return null;
    }
  }
}
