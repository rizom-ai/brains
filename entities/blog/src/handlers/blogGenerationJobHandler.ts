import { BaseGenerationJobHandler, ensureUniqueTitle } from "@brains/plugins";
import type { GeneratedContent } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z, slugify } from "@brains/utils";
import { generationResultSchema } from "@brains/contracts";
import type { EntityPluginContext } from "@brains/plugins";
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
export class BlogGenerationJobHandler extends BaseGenerationJobHandler<
  BlogGenerationJobData,
  BlogGenerationResult
> {
  constructor(logger: Logger, context: EntityPluginContext) {
    super(logger, context, {
      schema: blogGenerationJobSchema,
      jobTypeName: "blog-generation",
      entityType: "post",
    });
  }

  protected async generate(
    data: BlogGenerationJobData,
    progressReporter: ProgressReporter,
  ): Promise<GeneratedContent> {
    const { prompt, coverImageId, seriesName, seriesIndex, skipAi } = data;
    let { title, content, excerpt } = data;

    // skipAi mode: create skeleton blog post with placeholders
    if (skipAi) {
      if (!title) {
        this.failEarly("Title is required when skipAi is true");
      }

      content =
        content ??
        `## Introduction

Add your introduction here.

## Main Content

Add your main content here.

## Conclusion

Add your conclusion here.`;

      excerpt = excerpt ?? `Blog post about ${title}`;

      await this.reportProgress(progressReporter, {
        progress: 50,
        message: "Creating skeleton blog post",
      });
    }
    // Case 1: AI generates everything
    else if (!title || !content) {
      await this.reportProgress(progressReporter, {
        progress: 10,
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

      await this.reportProgress(progressReporter, {
        progress: 50,
        message: `Generated blog post: "${title}"`,
      });
    }
    // Case 2: User provided title+content, but no excerpt
    else if (!excerpt) {
      await this.reportProgress(progressReporter, {
        progress: 30,
        message: "Generating excerpt with AI",
      });

      const excerptGenerated = await this.context.ai.generate<{
        excerpt: string;
      }>({
        prompt: `Title: ${title}\n\nContent:\n${content}`,
        templateName: "blog:excerpt",
      });

      excerpt = excerptGenerated.excerpt;

      await this.reportProgress(progressReporter, {
        progress: 50,
        message: "Excerpt generated",
      });
    } else {
      await this.reportProgress(progressReporter, {
        progress: 50,
        message: "Using provided content",
      });
    }

    const author = this.context.identity.getProfile().name;

    // Handle series indexing
    let finalSeriesIndex = seriesIndex;
    if (seriesName && !seriesIndex) {
      const seriesPosts =
        await this.context.entityService.listEntities<BlogPost>({
          entityType: "post",
        });
      const postsInSeries = seriesPosts.filter(
        (p) => p.metadata.seriesName === seriesName && p.metadata.publishedAt,
      );
      finalSeriesIndex = postsInSeries.length + 1;
    }

    if (!title || !content) {
      this.failEarly("Title and content are required");
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

    return {
      id: finalTitle,
      content: blogPostAdapter.createPostContent(frontmatter, content),
      metadata: {
        title: finalTitle,
        slug,
        status: frontmatter.status,
        publishedAt: frontmatter.publishedAt,
        seriesName: frontmatter.seriesName,
        seriesIndex: frontmatter.seriesIndex,
      },
      title: finalTitle,
      resultExtras: { title: finalTitle, slug },
      createOptions: { deduplicateId: true },
    };
  }

  protected override summarizeDataForLog(
    data: BlogGenerationJobData,
  ): Record<string, unknown> {
    return {
      prompt: data.prompt,
      title: data.title,
    };
  }
}
