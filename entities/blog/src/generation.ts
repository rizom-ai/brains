import {
  frontmatterRecordFields,
  type GenerationResult,
  generationResultSchema,
} from "@brains/contracts";
import type {
  EntityGenerationContext,
  EntityGenerationDeclaration,
  EntityGenerationResult,
} from "@brains/sdk/entities";
import {
  ensureUniqueTitle,
  entityRuntime,
  uniqueTitleContext,
  type EntityRuntime,
} from "@brains/sdk/internal/entity-runtime";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import type { blogPostMetadataSchema } from "./schemas/blog-post";

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

const SKELETON = `## Introduction

Add your introduction here.

## Main Content

Add your main content here.

## Conclusion

Add your conclusion here.`;

interface Generated {
  readonly title: string;
  readonly content: string;
  readonly excerpt: string;
}

/** A failure the generation answers with, as the class failed early. */
class GenerationRefused extends Error {}

/**
 * The text of the entities a generation is based on, so the post is written
 * from them rather than from whatever a knowledge search on the prompt finds.
 * The sources were resolved at the caller's scope, which the run reads at.
 */
async function readSourceMaterial(
  runtime: EntityRuntime,
  data: BlogGenerationJobData,
): Promise<string | undefined> {
  const ids = data.sourceEntityIds ?? [];
  if (ids.length === 0) return undefined;
  const entityType = data.sourceEntityType;
  if (!entityType) {
    throw new GenerationRefused(
      "sourceEntityType is required with sourceEntityIds",
    );
  }
  const sources = await Promise.all(
    ids.map(async (id) => ({
      id,
      entity: await runtime.anyEntities.getEntity({ entityType, id }),
    })),
  );
  const missing = sources.filter(({ entity }) => !entity).map(({ id }) => id);
  if (missing.length > 0) {
    throw new GenerationRefused(
      `Source not found: ${missing.map((id) => `${entityType}/${id}`).join(", ")}`,
    );
  }
  return sources
    .flatMap(({ id, entity }) => {
      if (!entity) return [];
      const title = entity.metadata["title"];
      return [
        `## ${typeof title === "string" ? title : id}\n\n${frontmatterRecordFields(entity).body}`,
      ];
    })
    .join("\n\n---\n\n");
}

/** The title, body and excerpt: given, a skeleton, or written by the AI. */
async function writePost(
  context: EntityGenerationContext<BlogGenerationJobData>,
  runtime: EntityRuntime,
): Promise<Generated> {
  const { input, ai, progress } = context;
  const { prompt, seriesName, skipAi } = input;
  const { title, content, excerpt } = input;

  // skipAi mode: create skeleton blog post with placeholders
  if (skipAi) {
    if (!title) {
      throw new GenerationRefused("Title is required when skipAi is true");
    }
    await progress.report({
      progress: 50,
      message: "Creating skeleton blog post",
    });
    return {
      title,
      content: content ?? SKELETON,
      excerpt: excerpt ?? `Blog post about ${title}`,
    };
  }
  // Case 1: AI generates everything
  if (!title || !content) {
    await progress.report({
      progress: 10,
      message: "Generating blog post content with AI",
    });
    const defaultPrompt =
      "Write an insightful blog post about a topic from my knowledge base that would be valuable to share";
    const sourceMaterial = await readSourceMaterial(runtime, input);
    const generationPrompt = `${prompt ?? defaultPrompt}${seriesName ? `\n\nNote: This is part of a series called "${seriesName}".` : ""}${sourceMaterial ? `\n\nWrite the post from this source material:\n\n${sourceMaterial}` : ""}`;
    const generated = await ai.generate(
      {
        template: "generation",
        prompt: generationPrompt,
        representedIdentity: "anchor",
        voice: true,
      },
      generatedBlogPostSchema,
    );
    const written = {
      title: title ?? generated.title,
      content: content ?? generated.content,
      excerpt: excerpt ?? generated.excerpt,
    };
    await progress.report({
      progress: 50,
      message: `Generated blog post: "${written.title}"`,
    });
    return written;
  }
  // Case 2: User provided title+content, but no excerpt
  if (!excerpt) {
    await progress.report({
      progress: 30,
      message: "Generating excerpt with AI",
    });
    const generated = await ai.generate(
      {
        template: "excerpt",
        prompt: `Title: ${title}\n\nContent:\n${content}`,
        representedIdentity: "none",
        voice: true,
      },
      generatedExcerptSchema,
    );
    await progress.report({ progress: 50, message: "Excerpt generated" });
    return { title, content, excerpt: generated.excerpt };
  }
  await progress.report({ progress: 50, message: "Using provided content" });
  return { title, content, excerpt };
}

/**
 * The next index in a series: one past the published posts already in it,
 * read at the run's scope.
 */
async function nextSeriesIndex(
  runtime: EntityRuntime,
  seriesName: string,
): Promise<number> {
  const posts = await runtime.anyEntities.listEntities({ entityType: "post" });
  return (
    posts.filter(
      (post) =>
        post.metadata["seriesName"] === seriesName &&
        post.metadata["publishedAt"],
    ).length + 1
  );
}

/**
 * The post's `post:generation`: the title, body and excerpt from the AI,
 * as the anchor and in the brain's voice, from the sources it names; a
 * skeleton without it; an excerpt written for a given body; the author from
 * the anchor's profile, its place in a series counted, a title that is
 * taken asked for again; saved under its title beside any post that already
 * has it.
 */
export const postGeneration: EntityGenerationDeclaration<
  typeof blogGenerationJobSchema,
  typeof blogPostMetadataSchema
> = {
  input: blogGenerationJobSchema,
  generate: async (
    context,
  ): Promise<EntityGenerationResult<typeof blogPostMetadataSchema>> => {
    const { input } = context;
    const runtime = entityRuntime(context);
    let written: Generated;
    try {
      written = await writePost(context, runtime);
    } catch (error) {
      if (error instanceof GenerationRefused) {
        return { success: false, error: error.message };
      }
      throw error;
    }
    const { title, content, excerpt } = written;
    if (!title || !content) {
      return { success: false, error: "Title and content are required" };
    }

    const author = input.author ?? runtime.identity.getProfile().name;
    const status = input.status ?? "draft";
    const publishedAt =
      input.publishedAt ??
      (status === "published" ? new Date().toISOString() : undefined);
    const seriesIndex =
      input.seriesName && !input.seriesIndex
        ? await nextSeriesIndex(runtime, input.seriesName)
        : input.seriesIndex;

    // Ensure title doesn't collide with an existing entity
    const finalTitle = await ensureUniqueTitle({
      entityType: "post",
      title,
      deriveId: (t) => t,
      regeneratePrompt:
        "Generate a different blog post title on the same topic.",
      context: uniqueTitleContext(runtime),
    });
    const slug = slugify(finalTitle);

    return runtime.deduplicated({
      success: true,
      id: finalTitle,
      content,
      metadata: {
        title: finalTitle,
        slug,
        authoredSlug: true,
        status,
        ...(publishedAt && { publishedAt }),
        excerpt,
        author,
        ...(input.canonicalUrl && { canonicalUrl: input.canonicalUrl }),
        ...(input.coverImageId && { coverImageId: input.coverImageId }),
        ...(input.seriesName && { seriesName: input.seriesName }),
        ...(seriesIndex && { seriesIndex }),
      },
      resultExtras: { title: finalTitle, slug },
    });
  },
};
