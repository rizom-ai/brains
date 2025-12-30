import { BaseJobHandler } from "@brains/job-queue";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { SocialPost, SocialPostFrontmatter } from "../schemas/social-post";
import { socialPostAdapter } from "../adapters/social-post-adapter";
import type { SocialMediaConfig } from "../config";
import { getTemplateName } from "../templates";

/**
 * Input schema for social post generation job
 */
export const generationJobSchema = z.object({
  prompt: z.string().optional(),
  platform: z.enum(["linkedin"]).optional(),
  sourceEntityType: z.enum(["post", "deck"]).optional(),
  sourceEntityId: z.string().optional(),
  content: z.string().optional(),
  addToQueue: z.boolean().optional(),
});

export type GenerationJobData = z.infer<typeof generationJobSchema>;

/**
 * Result schema for social post generation job
 */
export const generationResultSchema = z.object({
  success: z.boolean(),
  entityId: z.string().optional(),
  slug: z.string().optional(),
  error: z.string().optional(),
});

export type GenerationResult = z.infer<typeof generationResultSchema>;

/**
 * Job handler for social post generation
 * Handles AI-powered content generation from prompts or source entities
 */
export class GenerationJobHandler extends BaseJobHandler<
  "generation",
  GenerationJobData,
  GenerationResult
> {
  constructor(
    logger: Logger,
    private context: ServicePluginContext,
    _config: SocialMediaConfig, // Config available for future extensions
  ) {
    super(logger, {
      jobTypeName: "social-post-generation",
      schema: generationJobSchema,
    });
  }

  async process(
    data: GenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<GenerationResult> {
    // Apply defaults
    const platform = data.platform ?? "linkedin";
    const addToQueue = data.addToQueue ?? true;
    const { prompt, sourceEntityType, sourceEntityId } = data;
    let { content } = data;

    try {
      await progressReporter.report({
        progress: 0,
        total: 100,
        message: "Starting social post generation",
      });

      // Case 1: Direct content provided (no AI needed)
      if (content) {
        await progressReporter.report({
          progress: 50,
          total: 100,
          message: "Using provided content",
        });
      }
      // Case 2: Generate from source entity
      else if (sourceEntityId && sourceEntityType) {
        await progressReporter.report({
          progress: 10,
          total: 100,
          message: `Fetching source ${sourceEntityType}`,
        });

        const sourceEntity = await this.context.entityService.getEntity(
          sourceEntityType,
          sourceEntityId,
        );

        if (!sourceEntity) {
          return {
            success: false,
            error: `Source entity not found: ${sourceEntityType}/${sourceEntityId}`,
          };
        }

        await progressReporter.report({
          progress: 30,
          total: 100,
          message: "Generating social post from source content",
        });

        // Extract slug from metadata for source reference
        const slugSchema = z.object({ slug: z.string() });
        const parsed = slugSchema.safeParse(sourceEntity.metadata);
        const slug = parsed.success ? parsed.data.slug : sourceEntityId;

        // Generate post from source content using platform-specific template
        const generated = await this.context.generateContent<{
          content: string;
        }>({
          prompt: `Create an engaging ${platform} post to promote this ${sourceEntityType}:

Source: ${sourceEntityType}/${slug}

${sourceEntity.content}`,
          templateName: getTemplateName(platform),
        });

        content = generated.content;

        await progressReporter.report({
          progress: 50,
          total: 100,
          message: "Social post generated from source",
        });
      }
      // Case 3: Generate from prompt
      else if (prompt) {
        await progressReporter.report({
          progress: 10,
          total: 100,
          message: "Generating social post with AI",
        });

        // Generate post from prompt using platform-specific template
        const generated = await this.context.generateContent<{
          content: string;
        }>({
          prompt: prompt,
          templateName: getTemplateName(platform),
        });

        content = generated.content;

        await progressReporter.report({
          progress: 50,
          total: 100,
          message: "Social post generated",
        });
      } else {
        return {
          success: false,
          error:
            "No content source provided (prompt, sourceEntityId, or content)",
        };
      }

      // Create social post entity
      await progressReporter.report({
        progress: 60,
        total: 100,
        message: "Creating social post entity",
      });

      // Determine status and queue order
      const status = addToQueue ? "queued" : "draft";
      let queueOrder: number | undefined;

      if (addToQueue) {
        const queuedPosts =
          await this.context.entityService.listEntities<SocialPost>(
            "social-post",
            {
              filter: { metadata: { status: "queued" } },
              limit: 1000,
            },
          );
        queueOrder = queuedPosts.length + 1;
      }

      // At this point content is guaranteed to be set from one of the branches
      if (!content) {
        return {
          success: false,
          error: "Content was not generated",
        };
      }

      // Create frontmatter
      const frontmatter: SocialPostFrontmatter = {
        content,
        platform,
        status,
        retryCount: 0,
        ...(queueOrder !== undefined && { queueOrder }),
        ...(sourceEntityId && { sourceEntityId }),
        ...(sourceEntityType && { sourceEntityType }),
      };

      const postContent = socialPostAdapter.createPostContent(frontmatter, "");
      const partial = socialPostAdapter.fromMarkdown(postContent);

      await progressReporter.report({
        progress: 80,
        total: 100,
        message: "Saving social post to database",
      });

      // partial.metadata is guaranteed from fromMarkdown
      const metadata = partial.metadata;
      if (!metadata) {
        return {
          success: false,
          error: "Failed to parse social post metadata",
        };
      }

      const result = await this.context.entityService.createEntity({
        entityType: "social-post",
        content: postContent,
        metadata,
      });

      await progressReporter.report({
        progress: 100,
        total: 100,
        message: `Social post created${addToQueue ? ` at queue position ${queueOrder}` : " as draft"}`,
      });

      return {
        success: true,
        entityId: result.entityId,
        slug: metadata.slug,
      };
    } catch (error) {
      this.logger.error("Social post generation job failed", {
        error,
        jobId,
        data,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  protected override summarizeDataForLog(
    data: GenerationJobData,
  ): Record<string, unknown> {
    return {
      platform: data.platform ?? "linkedin",
      hasPrompt: !!data.prompt,
      sourceEntityType: data.sourceEntityType,
      addToQueue: data.addToQueue ?? true,
    };
  }
}
