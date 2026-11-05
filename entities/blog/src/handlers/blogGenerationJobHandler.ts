import { BaseGenerationJobHandler, ensureUniqueTitle } from "@brains/plugins";
import type { GeneratedContent } from "@brains/plugins";
import {
  type GenerationResult,
  generationResultSchema,
} from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { slugify } from "@brains/utils/string-utils";
import { parseMarkdown } from "@brains/utils/markdown";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { EntityPluginContext } from "@brains/plugins";
import { blogPostSchema, type BlogPostFrontmatter } from "../schemas/blog-post";

/**
 * Input schema for blog generation job
 */
export const blogGenerationJobSchema: z.ZodObject<{
  prompt: z.ZodOptional<z.ZodString>;
  title: z.ZodOptional<z.ZodString>;
  content: z.ZodOptional<z.ZodString>;
  excerpt: z.ZodOptional<z.ZodString>;
  author: z.ZodOptional<z.ZodString>;
  status: z.ZodOptional<
    z.ZodEnum<{ draft: "draft"; queued: "queued"; published: "published" }>
  >;
  publishedAt: z.ZodOptional<z.ZodString>;
  canonicalUrl: z.ZodOptional<z.ZodString>;
  coverImageId: z.ZodOptional<z.ZodString>;
  seriesName: z.ZodOptional<z.ZodString>;
  seriesIndex: z.ZodOptional<z.ZodNumber>;
  sourceEntityType: z.ZodOptional<z.ZodString>;
  sourceEntityIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
  skipAi: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  prompt: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  author: z.string().optional(),
  status: z.enum(["draft", "queued", "published"]).optional(),
  publishedAt: z.string().datetime().optional(),
  canonicalUrl: z.string().url().optional(),
  coverImageId: z.string().optional(),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
  sourceEntityType: z.string().optional(),
  sourceEntityIds: z.array(z.string()).optional(),
  skipAi: z.boolean().optional(),
});

/** Shape the blog generation template returns. */
export const generatedBlogPostSchema: z.ZodObject<{
  title: z.ZodString;
  content: z.ZodString;
  excerpt: z.ZodString;
}> = z.object({
  title: z.string(),
  content: z.string(),
  excerpt: z.string(),
});

/** Shape the blog excerpt template returns. */
export const generatedExcerptSchema: z.ZodObject<{
  excerpt: z.ZodString;
}> = z.object({ excerpt: z.string() });

export type BlogGenerationJobData = z.output<typeof blogGenerationJobSchema>;

export interface BlogGenerationResult extends GenerationResult {
  title?: string | undefined;
  slug?: string | undefined;
}

export const blogGenerationResultSchema: ReturnType<
  typeof generationResultSchema.extend<{
    title: z.ZodOptional<z.ZodString>;
    slug: z.ZodOptional<z.ZodString>;
  }>
> = generationResultSchema.extend({
  title: z.string().optional(),
  slug: z.string().optional(),
});

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
      const sourceMaterial = await this.readSourceMaterial(data);
      const generationPrompt = `${finalPrompt}${seriesName ? `\n\nNote: This is part of a series called "${seriesName}".` : ""}${sourceMaterial ? `\n\nWrite the post from this source material:\n\n${sourceMaterial}` : ""}`;

      const voiceGuidance = formatVoiceGuidance(
        await fetchStyleGuide(this.context.entityService),
      );
      const generated = await this.context.ai.generate(
        {
          prompt: generationPrompt,
          templateName: "blog:generation",
          representedIdentity: "anchor",
          ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
        },
        generatedBlogPostSchema,
      );

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

      const voiceGuidance = formatVoiceGuidance(
        await fetchStyleGuide(this.context.entityService),
      );
      const excerptGenerated = await this.context.ai.generate(
        {
          prompt: `Title: ${title}\n\nContent:\n${content}`,
          templateName: "blog:excerpt",
          representedIdentity: "none",
          ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
        },
        generatedExcerptSchema,
      );

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

    const author = data.author ?? this.context.identity.getProfile().name;
    const status = data.status ?? "draft";
    const publishedAt =
      data.publishedAt ??
      (status === "published" ? new Date().toISOString() : undefined);

    // Handle series indexing
    let finalSeriesIndex = seriesIndex;
    if (seriesName && !seriesIndex) {
      const seriesPosts = await this.context.entityService.listEntities(
        { entityType: "post" },
        blogPostSchema,
      );
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
      status,
      ...(publishedAt && { publishedAt }),
      excerpt,
      author,
      ...(data.canonicalUrl && { canonicalUrl: data.canonicalUrl }),
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

  /**
   * The text of the entities a generation is based on, so the post is written
   * from them rather than from whatever a knowledge search on the prompt finds.
   */
  private async readSourceMaterial(
    data: BlogGenerationJobData,
  ): Promise<string | undefined> {
    const ids = data.sourceEntityIds ?? [];
    if (ids.length === 0) return undefined;
    const entityType = data.sourceEntityType;
    if (!entityType) {
      this.failEarly("sourceEntityType is required with sourceEntityIds");
    }
    const sources = await Promise.all(
      ids.map(async (id) => ({
        id,
        entity: await this.context.entityService.getEntity({
          entityType,
          id,
          visibilityScope: "restricted",
        }),
      })),
    );
    const missing = sources.filter(({ entity }) => !entity).map(({ id }) => id);
    if (missing.length > 0) {
      this.failEarly(
        `Source not found: ${missing.map((id) => `${entityType}/${id}`).join(", ")}`,
      );
    }
    return sources
      .map(({ id, entity }) => {
        const parsed = parseMarkdown(entity?.content ?? "");
        const title = entity?.metadata["title"];
        return `## ${typeof title === "string" ? title : id}\n\n${parsed.content}`;
      })
      .join("\n\n---\n\n");
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
