import { BaseJobHandler, ensureUniqueTitle } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import {
  getErrorMessage,
  z,
  slugify,
  generationResultSchema,
} from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { SocialPost, SocialPostFrontmatter } from "../schemas/social-post";
import { socialPostAdapter } from "../adapters/social-post-adapter";
import { getTemplateName } from "../templates";

/**
 * Input schema for social post generation job
 */
export const generationJobSchema = z.object({
  prompt: z.string().optional(),
  platform: z.enum(["linkedin"]).optional(),
  sourceEntityType: z.enum(["post", "deck"]).optional(),
  sourceEntityId: z.string().optional(),
  title: z
    .string()
    .optional()
    .describe("Required when content is provided directly"),
  content: z.string().optional(),
  addToQueue: z.boolean().optional(),
  generateImage: z
    .boolean()
    .optional()
    .describe("Auto-generate cover image for post"),
});

export type GenerationJobData = z.infer<typeof generationJobSchema>;

export const socialMediaGenerationResultSchema = generationResultSchema.extend({
  slug: z.string().optional(),
});

export type GenerationResult = z.infer<
  typeof socialMediaGenerationResultSchema
>;

export class GenerationJobHandler extends BaseJobHandler<
  "generation",
  GenerationJobData,
  GenerationResult
> {
  constructor(
    logger: Logger,
    private context: ServicePluginContext,
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
    const addToQueue = data.addToQueue ?? false;
    const { prompt, sourceEntityType, sourceEntityId } = data;
    let { content, title } = data;

    try {
      await progressReporter.report({
        progress: 0,
        total: 100,
        message: "Starting social post generation",
      });

      // Case 1: Direct content provided (no AI needed)
      if (content) {
        if (!title) {
          return {
            success: false,
            error: "Title is required when providing content directly",
          };
        }
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
        const generated = await this.context.ai.generate<{
          title: string;
          content: string;
        }>({
          prompt: `Create an engaging ${platform} post to promote this ${sourceEntityType}:

Source: ${sourceEntityType}/${slug}

${sourceEntity.content}`,
          templateName: getTemplateName(platform),
        });

        title = generated.title;
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
        const generated = await this.context.ai.generate<{
          title: string;
          content: string;
        }>({
          prompt: prompt,
          templateName: getTemplateName(platform),
        });

        title = generated.title;
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

      // At this point content and title are guaranteed to be set from one of the branches
      if (!content || !title) {
        return {
          success: false,
          error: "Content or title was not generated",
        };
      }

      // Create frontmatter (content fields only, operational state lives in memory)
      const frontmatter: SocialPostFrontmatter = {
        title,
        platform,
        status,
        ...(sourceEntityId && { sourceEntityId }),
        ...(sourceEntityType && { sourceEntityType }),
      };

      // Content goes in markdown body, not frontmatter
      const postContent = socialPostAdapter.createPostContent(
        frontmatter,
        content,
      );
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

      // Ensure title doesn't collide with an existing entity
      const finalTitle = await ensureUniqueTitle({
        entityType: "social-post",
        title,
        deriveId: (t) => `${platform}-${slugify(t)}`,
        regeneratePrompt:
          "Generate a different social media post title on the same topic.",
        context: this.context,
      });

      // Rebuild metadata if title changed
      if (finalTitle !== title) {
        metadata.title = finalTitle;
        metadata.slug = `${platform}-${slugify(finalTitle)}`;
      }

      const result = await this.context.entityService.createEntity(
        {
          id: metadata.slug,
          entityType: "social-post",
          content: postContent,
          metadata,
        },
        { deduplicateId: true },
      );

      // Queue image generation if requested
      if (data.generateImage) {
        await progressReporter.report({
          progress: 90,
          total: 100,
          message: "Queueing image generation",
        });

        // Use fully-qualified job type for cross-plugin job
        await this.context.jobs.enqueue(
          "image:image-generate",
          {
            prompt: `Social media graphic for: ${title}`,
            title: `${title} Image`,
            aspectRatio: "16:9",
            targetEntityType: "social-post",
            targetEntityId: result.entityId,
          },
          { interfaceType: "job", userId: "system" },
        );
      }

      await progressReporter.report({
        progress: 100,
        total: 100,
        message: `Social post created${addToQueue ? ` at queue position ${queueOrder}` : " as draft"}${data.generateImage ? " (image generation queued)" : ""}`,
      });

      await this.context.messaging.send("generate:report:success", {
        entityType: "social-post",
        entityId: result.entityId,
      });

      return {
        success: true,
        entityId: result.entityId,
        slug: metadata.slug,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error("Social post generation job failed", {
        error,
        jobId,
        data,
      });

      await this.context.messaging.send("generate:report:failure", {
        entityType: "social-post",
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
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
      addToQueue: data.addToQueue ?? false,
      generateImage: data.generateImage ?? false,
    };
  }
}
