import { BaseJobHandler, ensureUniqueTitle } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z, slugify, generationResultSchema } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { BlogPostFrontmatter, BlogPost } from "../schemas/blog-post";

/**
 * Input schema for blog generation job
 */
export const blogGenerationJobSchema = z.object({
  prompt: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  coverImageId: z.string().optional(),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
  skipAi: z.boolean().optional(),
});

export type BlogGenerationJobData = z.infer<typeof blogGenerationJobSchema>;

export const blogGenerationResultSchema = generationResultSchema.extend({
  title: z.string().optional(),
  slug: z.string().optional(),
});

export type BlogGenerationResult = z.infer<typeof blogGenerationResultSchema>;

/**
 * Job handler for blog post generation
 * Handles AI-powered content generation and entity creation
 */
export class BlogGenerationJobHandler extends BaseJobHandler<
  "generation",
  BlogGenerationJobData,
  BlogGenerationResult
> {
  constructor(
    logger: Logger,
    private context: ServicePluginContext,
  ) {
    super(logger, {
      schema: blogGenerationJobSchema,
      jobTypeName: "blog-generation",
    });
  }

  async process(
    data: BlogGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<BlogGenerationResult> {
    const { prompt, coverImageId, seriesName, seriesIndex, skipAi } = data;
    let { title, content, excerpt } = data;

    try {
      await progressReporter.report({
        progress: 0,
        total: 100,
        message: "Starting blog post generation",
      });

      // skipAi mode: create skeleton blog post with placeholders
      if (skipAi) {
        if (!title) {
          return {
            success: false,
            error: "Title is required when skipAi is true",
          };
        }

        // Use provided content or create a skeleton template
        content =
          content ??
          `## Introduction

Add your introduction here.

## Main Content

Add your main content here.

## Conclusion

Add your conclusion here.`;

        excerpt = excerpt ?? `Blog post about ${title}`;

        await progressReporter.report({
          progress: 50,
          total: 100,
          message: "Creating skeleton blog post",
        });
      }
      // Case 1: AI generates everything (title, content, excerpt)
      else if (!title || !content) {
        await progressReporter.report({
          progress: 10,
          total: 100,
          message: "Generating blog post content with AI",
        });

        const defaultPrompt =
          "Write an insightful blog post about a topic from my knowledge base that would be valuable to share";
        const finalPrompt = prompt ?? defaultPrompt;

        const generationPrompt = `${finalPrompt}${seriesName ? `\n\nNote: This is part of a series called "${seriesName}".` : ""}`;

        const generated = await this.context.ai.generate<{
          title: string;
          content: string;
          excerpt: string;
        }>({
          prompt: generationPrompt,
          templateName: "blog:generation",
        });

        title = title ?? generated.title;
        content = content ?? generated.content;
        excerpt = excerpt ?? generated.excerpt;

        await progressReporter.report({
          progress: 50,
          total: 100,
          message: `Generated blog post: "${title}"`,
        });
      }
      // Case 2: User provided title+content, but no excerpt - AI generates excerpt
      else if (!excerpt) {
        await progressReporter.report({
          progress: 30,
          total: 100,
          message: "Generating excerpt with AI",
        });

        const excerptGenerated = await this.context.ai.generate<{
          excerpt: string;
        }>({
          prompt: `Title: ${title}\n\nContent:\n${content}`,
          templateName: "blog:excerpt",
        });

        excerpt = excerptGenerated.excerpt;

        await progressReporter.report({
          progress: 50,
          total: 100,
          message: "Excerpt generated",
        });
      } else {
        await progressReporter.report({
          progress: 50,
          total: 100,
          message: "Using provided content",
        });
      }

      await progressReporter.report({
        progress: 60,
        total: 100,
        message: "Creating blog post entity",
      });

      const author = this.context.identity.getProfile().name;

      // Handle series indexing
      let finalSeriesIndex = seriesIndex;
      if (seriesName && !seriesIndex) {
        const seriesPosts =
          await this.context.entityService.listEntities<BlogPost>("post");
        const postsInSeries = seriesPosts.filter(
          (p) => p.metadata.seriesName === seriesName && p.metadata.publishedAt,
        );
        finalSeriesIndex = postsInSeries.length + 1;
      }

      // Ensure title doesn't collide with an existing entity
      const finalTitle = await ensureUniqueTitle({
        entityType: "post",
        title,
        deriveId: (t) => t,
        regeneratePrompt:
          "Generate a different blog post title on the same topic.",
        context: this.context,
      });
      const slug = slugify(finalTitle);

      await progressReporter.report({
        progress: 80,
        total: 100,
        message: "Saving blog post to database",
      });

      const { blogPostAdapter } = await import("../adapters/blog-post-adapter");

      const frontmatter: BlogPostFrontmatter = {
        title: finalTitle,
        slug,
        status: "draft" as const,
        excerpt,
        author,
        ...(coverImageId && { coverImageId }),
        ...(seriesName && { seriesName }),
        ...(finalSeriesIndex && { seriesIndex: finalSeriesIndex }),
      };

      const result = await this.context.entityService.createEntity(
        {
          id: finalTitle,
          entityType: "post",
          content: blogPostAdapter.createPostContent(frontmatter, content),
          metadata: {
            title: finalTitle,
            slug,
            status: frontmatter.status,
            publishedAt: frontmatter.publishedAt,
            seriesName: frontmatter.seriesName,
            seriesIndex: frontmatter.seriesIndex,
          },
        },
        { deduplicateId: true },
      );

      await progressReporter.report({
        progress: 100,
        total: 100,
        message: `Blog post "${finalTitle}" created successfully`,
      });

      return {
        success: true,
        entityId: result.entityId,
        title: finalTitle,
        slug,
      };
    } catch (error) {
      this.logger.error("Blog generation job failed", {
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

  /**
   * Summarize data for logging - only include relevant fields
   */
  protected override summarizeDataForLog(
    data: BlogGenerationJobData,
  ): Record<string, unknown> {
    return {
      prompt: data.prompt,
      title: data.title,
    };
  }
}
