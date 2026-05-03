import { BaseGenerationJobHandler, ensureUniqueTitle } from "@brains/plugins";
import type { GeneratedContent } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z, slugify, generationResultSchema } from "@brains/utils";
import type { EntityPluginContext } from "@brains/plugins";
import type { SocialPostFrontmatter } from "../schemas/social-post";
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

export class GenerationJobHandler extends BaseGenerationJobHandler<
  GenerationJobData,
  GenerationResult
> {
  constructor(logger: Logger, context: EntityPluginContext) {
    super(logger, context, {
      schema: generationJobSchema,
      jobTypeName: "social-post-generation",
      entityType: "social-post",
    });
  }

  protected async generate(
    data: GenerationJobData,
    progressReporter: ProgressReporter,
  ): Promise<GeneratedContent> {
    const platform = data.platform ?? "linkedin";
    const addToQueue = data.addToQueue ?? false;
    const { prompt, sourceEntityType, sourceEntityId } = data;
    let { content, title } = data;

    // Case 1: Direct content with title (no AI needed)
    if (content && title) {
      await this.reportProgress(progressReporter, {
        progress: 50,
        message: "Using provided content",
      });
    }
    // Case 1b: Content without title — pass through AI to shape and generate title
    else if (content && !title) {
      await this.reportProgress(progressReporter, {
        progress: 10,
        message: "Shaping content with AI",
      });

      const generated = await this.context.ai.generate<{
        title: string;
        content: string;
      }>({
        prompt: content,
        templateName: getTemplateName(platform),
      });

      title = generated.title;
      content = generated.content;

      await this.reportProgress(progressReporter, {
        progress: 50,
        message: "Social post shaped from content",
      });
    }
    // Case 2: Generate from source entity
    else if (sourceEntityId && sourceEntityType) {
      await this.reportProgress(progressReporter, {
        progress: 10,
        message: `Fetching source ${sourceEntityType}`,
      });

      const sourceEntity = await this.context.entityService.getEntity(
        sourceEntityType,
        sourceEntityId,
      );

      if (!sourceEntity) {
        this.failEarly(
          `Source entity not found: ${sourceEntityType}/${sourceEntityId}`,
        );
      }

      await this.reportProgress(progressReporter, {
        progress: 30,
        message: "Generating social post from source content",
      });

      const slugSchema = z.object({ slug: z.string() });
      const parsed = slugSchema.safeParse(sourceEntity.metadata);
      const slug = parsed.success ? parsed.data.slug : sourceEntityId;

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

      await this.reportProgress(progressReporter, {
        progress: 50,
        message: "Social post generated from source",
      });
    }
    // Case 3: Generate from prompt
    else if (prompt) {
      await this.reportProgress(progressReporter, {
        progress: 10,
        message: "Generating social post with AI",
      });

      const generated = await this.context.ai.generate<{
        title: string;
        content: string;
      }>({
        prompt,
        templateName: getTemplateName(platform),
      });

      title = generated.title;
      content = generated.content;

      await this.reportProgress(progressReporter, {
        progress: 50,
        message: "Social post generated",
      });
    } else {
      this.failEarly(
        "No content source provided (prompt, sourceEntityId, or content)",
      );
    }

    if (!content || !title) {
      this.failEarly("Content or title was not generated");
    }

    const status = addToQueue ? "queued" : "draft";

    // Create frontmatter
    const frontmatter: SocialPostFrontmatter = {
      title,
      platform,
      status,
      ...(sourceEntityId && { sourceEntityId }),
      ...(sourceEntityType && { sourceEntityType }),
    };

    const postContent = socialPostAdapter.createPostContent(
      frontmatter,
      content,
    );
    const partial = socialPostAdapter.fromMarkdown(postContent);
    const metadata = partial.metadata;

    if (!metadata) {
      this.failEarly("Failed to parse social post metadata");
    }

    // Ensure title doesn't collide
    const finalTitle = await ensureUniqueTitle({
      entityType: "social-post",
      title,
      deriveId: (t) => `${platform}-${slugify(t)}`,
      regeneratePrompt:
        "Generate a different social media post title on the same topic.",
      context: this.context,
    });

    let finalContent = postContent;
    if (finalTitle !== title) {
      metadata.title = finalTitle;
      metadata.slug = `${platform}-${slugify(finalTitle)}`;
      // Rebuild content with updated title in frontmatter
      const updatedFrontmatter: SocialPostFrontmatter = {
        ...frontmatter,
        title: finalTitle,
      };
      finalContent = socialPostAdapter.createPostContent(
        updatedFrontmatter,
        content,
      );
    }

    return {
      id: metadata.slug,
      content: finalContent,
      metadata,
      title: finalTitle,
      resultExtras: { slug: metadata.slug },
      createOptions: { deduplicateId: true },
    };
  }

  protected override async onGenerationFailure(
    _data: GenerationJobData,
    error: string,
  ): Promise<void> {
    await this.context.messaging.send({
      type: "generate:report:failure",
      payload: {
        entityType: "social-post",
        error,
      },
    });
  }

  protected override async afterCreate(
    data: GenerationJobData,
    entityId: string,
    progressReporter: ProgressReporter,
    generated: GeneratedContent,
  ): Promise<void> {
    // Queue image generation if requested
    if (data.generateImage) {
      await this.reportProgress(progressReporter, {
        progress: 90,
        message: "Queueing image generation",
      });

      const title = generated.title ?? "Social Post";
      await this.context.jobs.enqueue({
        type: "image:image-generate",
        data: {
          prompt: `Social media graphic for: ${title}`,
          title: `${title} Image`,
          aspectRatio: "16:9",
          targetEntityType: "social-post",
          targetEntityId: entityId,
        },
        toolContext: { interfaceType: "job", userId: "system" },
      });
    }

    await this.context.messaging.send({
      type: "generate:report:success",
      payload: {
        entityType: "social-post",
        entityId,
      },
    });
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
