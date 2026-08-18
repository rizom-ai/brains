import { BaseGenerationJobHandler, ensureUniqueTitle } from "@brains/plugins";
import type {
  GeneratedContent,
  EntityGenerationDeclaration,
} from "@brains/plugins";
import {
  type GenerationResult,
  generationResultSchema,
} from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { slugify } from "@brains/utils/string-utils";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { EntityPluginContext } from "@brains/plugins";
import type { BlogPostFrontmatter, BlogPost } from "../schemas/blog-post";

/**
 * Input schema for blog generation job
 */
export interface BlogGenerationJobData {
  prompt?: string | undefined;
  title?: string | undefined;
  content?: string | undefined;
  excerpt?: string | undefined;
  coverImageId?: string | undefined;
  seriesName?: string | undefined;
  seriesIndex?: number | undefined;
  skipAi?: boolean | undefined;
}

export const blogGenerationJobSchema: z.ZodType<BlogGenerationJobData> =
  z.object({
    prompt: z.string().optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    excerpt: z.string().optional(),
    coverImageId: z.string().optional(),
    seriesName: z.string().optional(),
    seriesIndex: z.number().optional(),
    skipAi: z.boolean().optional(),
  });

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
      const generationPrompt = `${finalPrompt}${seriesName ? `\n\nNote: This is part of a series called "${seriesName}".` : ""}`;

      const voiceGuidance = formatVoiceGuidance(
        await fetchStyleGuide(this.context.entityService),
      );
      const generated = await this.context.ai.generate<{
        title: string;
        content: string;
        excerpt: string;
      }>({
        prompt: generationPrompt,
        templateName: "blog:generation",
        representedIdentity: "anchor",
        ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
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
        representedIdentity: "none",
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

const SKELETON_BODY = (title: string): string =>
  [
    `# ${title}`,
    "",
    "## Introduction",
    "",
    "Add your introduction here.",
    "",
    "## Main Content",
    "",
    "Add your main content here.",
    "",
    "## Conclusion",
    "",
    "Add your conclusion here.",
  ].join("\n");

const DEFAULT_POST_PROMPT =
  "Write an insightful blog post about a topic from my knowledge base that would be valuable to share";

/**
 * Blog post generation, declared.
 *
 * `skipAi` produces a skeleton so an author can start from a structure; the
 * other branches fill in whatever the caller did not supply.
 */
export const postGeneration: EntityGenerationDeclaration<
  typeof blogGenerationJobSchema
> = {
  input: blogGenerationJobSchema,
  handle: async ({ input, ai, logger, entities, identity, progress }) => {
    const { prompt, coverImageId, seriesName, seriesIndex, skipAi } = input;
    let { title, content, excerpt } = input;

    if (skipAi) {
      if (!title) {
        return {
          success: false,
          error: "Title is required when skipAi is true",
        };
      }
      content = content ?? SKELETON_BODY(title);
      excerpt = excerpt ?? `Blog post about ${title}`;
      await progress.report({
        progress: 50,
        total: 100,
        message: "Creating skeleton blog post",
      });
    } else if (!title || !content) {
      await progress.report({
        progress: 10,
        total: 100,
        message: "Generating blog post content with AI",
      });
      const voiceGuidance = formatVoiceGuidance(
        await fetchStyleGuide(entities),
      );
      const generated = await ai.generate<{
        title: string;
        content: string;
        excerpt: string;
      }>({
        prompt: `${prompt ?? DEFAULT_POST_PROMPT}${seriesName ? `\n\nNote: This is part of a series called "${seriesName}".` : ""}`,
        templateName: "blog:generation",
        representedIdentity: "anchor",
        ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
      });
      title = title ?? generated.title;
      content = content ?? generated.content;
      excerpt = excerpt ?? generated.excerpt;
      await progress.report({
        progress: 50,
        total: 100,
        message: `Generated blog post: "${title}"`,
      });
    } else if (!excerpt) {
      await progress.report({
        progress: 30,
        total: 100,
        message: "Generating excerpt with AI",
      });
      const generated = await ai.generate<{ excerpt: string }>({
        prompt: `Title: ${title}\n\nContent:\n${content}`,
        templateName: "blog:excerpt",
        representedIdentity: "none",
      });
      excerpt = generated.excerpt;
    }

    if (!title || !content) {
      return { success: false, error: "Title and content are required" };
    }

    // A post joins a series at the end unless the caller placed it.
    let finalSeriesIndex = seriesIndex;
    if (seriesName && !seriesIndex) {
      const posts = await entities.listEntities<BlogPost>({
        entityType: "post",
      });
      finalSeriesIndex =
        posts.filter(
          (candidate) =>
            candidate.metadata.seriesName === seriesName &&
            candidate.metadata.publishedAt,
        ).length + 1;
    }

    const finalTitle = await ensureUniqueTitle({
      entityType: "post",
      title,
      deriveId: (candidate) => candidate,
      regeneratePrompt:
        "Generate a different blog post title on the same topic.",
      context: { entityService: entities, ai, logger },
    });
    const slug = slugify(finalTitle);
    const { blogPostAdapter } = await import("../adapters/blog-post-adapter");

    const frontmatter: BlogPostFrontmatter = {
      title: finalTitle,
      slug,
      status: "draft" as const,
      excerpt,
      author: identity.getProfile().name,
      ...(coverImageId && { coverImageId }),
      ...(seriesName && { seriesName }),
      ...(finalSeriesIndex && { seriesIndex: finalSeriesIndex }),
    };

    const result = await entities.create({
      id: finalTitle,
      entityType: "post",
      content: blogPostAdapter.createPostContent(frontmatter, content),
      metadata: {
        title: finalTitle,
        slug,
        status: frontmatter.status,
        ...(frontmatter.seriesName === undefined
          ? {}
          : { seriesName: frontmatter.seriesName }),
        ...(frontmatter.seriesIndex === undefined
          ? {}
          : { seriesIndex: frontmatter.seriesIndex }),
      },
    });

    await progress.report({
      progress: 100,
      total: 100,
      message: `Saved post: "${finalTitle}"`,
    });
    return {
      success: true,
      entityId: result.entityId,
      title: finalTitle,
      slug,
    };
  },
};
