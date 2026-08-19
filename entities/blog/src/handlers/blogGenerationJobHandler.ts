import { ensureUniqueTitle } from "@brains/plugins";
import type { EntityGenerationDeclaration } from "@brains/plugins";
import {
  type GenerationResult,
  generationResultSchema,
} from "@brains/contracts";
import { slugify } from "@brains/utils/string-utils";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/contracts";
import { z } from "@brains/utils/zod";
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
  generate: async ({ input, ai, logger, entities, identity, progress }) => {
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

    await progress.report({
      progress: 100,
      total: 100,
      message: `Wrote post: "${finalTitle}"`,
    });
    // Content, not an entity: the runtime decides whether this fills in a
    // pre-allocated post or creates a new one.
    return {
      success: true,
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
      resultExtras: { title: finalTitle, slug },
    };
  },
};
