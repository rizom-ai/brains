import {
  frontmatterRecordFields,
  generationResultSchema,
  imageGenerateJobContract,
} from "@brains/contracts";
import type {
  EntityGenerationContext,
  EntityGenerationDeclaration,
  EntityGenerationResult,
} from "@brains/sdk/entities";
import {
  afterGeneration,
  ensureUniqueTitle,
  entityRuntime,
  uniqueTitleContext,
  type EntityRuntime,
} from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import { socialPostSlug } from "./lib/social-post-markdown";
import type {
  Platform,
  SocialPostStatus,
  SourceEntityType,
  socialPostMetadataSchema,
} from "./schemas/social-post";

/** Shape the social generation templates produce; ai.generate parses through it. */
export const generatedPostSchema: z.ZodObject<{
  title: z.ZodString;
  content: z.ZodString;
}> = z.object({
  title: z.string(),
  content: z.string(),
});

interface CoverImageJobOptions {
  generate?: boolean | undefined;
  prompt?: string | undefined;
}

type CoverImageJobData = boolean | CoverImageJobOptions;

const coverImageJobSchema: z.ZodType<CoverImageJobData> = z.union([
  z.boolean(),
  z.object({
    generate: z.boolean().optional(),
    prompt: z.string().optional(),
  }),
]);

export interface GenerationJobData {
  prompt?: string | undefined;
  platform?: "linkedin" | undefined;
  sourceEntityType?: "post" | "deck" | undefined;
  sourceEntityId?: string | undefined;
  title?: string | undefined;
  content?: string | undefined;
  addToQueue?: boolean | undefined;
  generateImage?: boolean | undefined;
  coverImage?: CoverImageJobData | undefined;
}

/** Input schema for the social post generation job. */
export const generationJobSchema: z.ZodType<GenerationJobData> = z.object({
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
  coverImage: coverImageJobSchema
    .optional()
    .describe("Generic cover image generation request"),
});

export const socialMediaGenerationResultSchema: ReturnType<
  typeof generationResultSchema.extend<{
    slug: z.ZodOptional<z.ZodString>;
  }>
> = generationResultSchema.extend({
  slug: z.string().optional(),
});

export type GenerationResult = z.output<
  typeof socialMediaGenerationResultSchema
>;

/** A failure the generation answers with, as the class handler failed early. */
class GenerationRefused extends Error {}

interface Written {
  readonly title: string;
  readonly content: string;
}

/** The post's text, written by the AI as the anchor in the brain's voice. */
async function writeWithAI(
  context: EntityGenerationContext<GenerationJobData>,
  prompt: string,
): Promise<Written> {
  return context.ai.generate(
    {
      template: "linkedin",
      prompt,
      representedIdentity: "anchor",
      voice: true,
    },
    generatedPostSchema,
  );
}

/**
 * The prompt to share a source entity: its type and slug, its title when
 * it has one, and its text. A declared source reads back as its body, its
 * frontmatter its metadata; a stored document carries its frontmatter in
 * its content.
 */
async function sourcePrompt(
  runtime: EntityRuntime,
  platform: Platform,
  sourceEntityType: SourceEntityType,
  sourceEntityId: string,
): Promise<string> {
  const sourceEntity = await runtime.anyEntities.getEntity({
    entityType: sourceEntityType,
    id: sourceEntityId,
  });
  if (!sourceEntity) {
    throw new GenerationRefused(
      `Source entity not found: ${sourceEntityType}/${sourceEntityId}`,
    );
  }
  const slug = z
    .looseObject({ slug: z.string() })
    .safeParse(sourceEntity.metadata);
  const source = frontmatterRecordFields(sourceEntity);
  const sourceTitle = z
    .looseObject({ title: z.string() })
    .safeParse(source.fields);
  return `Write a ${platform} post to share this ${sourceEntityType}:

Source: ${sourceEntityType}/${slug.success ? slug.data.slug : sourceEntityId}

${sourceTitle.success ? `Title: ${sourceTitle.data.title}\n\n` : ""}${source.body}`;
}

/** The title and text: given, shaped from given text, or written by the AI. */
async function writePost(
  context: EntityGenerationContext<GenerationJobData>,
  runtime: EntityRuntime,
  platform: Platform,
): Promise<Written> {
  const { input, progress } = context;
  const { prompt, sourceEntityType, sourceEntityId, content, title } = input;
  // Case 1: Direct content with title (no AI needed)
  if (content && title) {
    await progress.report({
      progress: 50,
      message: "Using provided content",
    });
    return { title, content };
  }
  // Case 1b: Content without title — pass through AI to shape and generate title
  if (content) {
    await progress.report({
      progress: 10,
      message: "Shaping content with AI",
    });
    const shaped = await writeWithAI(context, content);
    await progress.report({
      progress: 50,
      message: "Social post shaped from content",
    });
    return shaped;
  }
  // Case 2: Generate from source entity
  if (sourceEntityId && sourceEntityType) {
    await progress.report({
      progress: 10,
      message: `Fetching source ${sourceEntityType}`,
    });
    const shared = await sourcePrompt(
      runtime,
      platform,
      sourceEntityType,
      sourceEntityId,
    );
    await progress.report({
      progress: 30,
      message: "Generating social post from source content",
    });
    const generated = await writeWithAI(context, shared);
    await progress.report({
      progress: 50,
      message: "Social post generated from source",
    });
    return generated;
  }
  // Case 3: Generate from prompt
  if (prompt) {
    await progress.report({
      progress: 10,
      message: "Generating social post with AI",
    });
    const generated = await writeWithAI(context, prompt);
    await progress.report({
      progress: 50,
      message: "Social post generated",
    });
    return generated;
  }
  throw new GenerationRefused(
    "No content source provided (prompt, sourceEntityId, or content)",
  );
}

const socialPostGenerationDeclaration: EntityGenerationDeclaration<
  typeof generationJobSchema,
  typeof socialPostMetadataSchema
> = {
  input: generationJobSchema,
  generate: async (
    context,
  ): Promise<EntityGenerationResult<typeof socialPostMetadataSchema>> => {
    const { input } = context;
    const runtime = entityRuntime(context);
    const platform = input.platform ?? "linkedin";
    let written: Written;
    try {
      written = await writePost(context, runtime, platform);
    } catch (error) {
      if (error instanceof GenerationRefused) {
        return { success: false, error: error.message };
      }
      throw error;
    }
    const { title, content } = written;
    if (!content || !title) {
      return { success: false, error: "Content or title was not generated" };
    }

    // Ensure title doesn't collide
    const finalTitle = await ensureUniqueTitle({
      entityType: "social-post",
      title,
      deriveId: (t) => socialPostSlug(platform, t),
      regeneratePrompt:
        "Generate a different social media post title on the same topic.",
      context: uniqueTitleContext(runtime),
    });
    const slug = socialPostSlug(platform, finalTitle);
    const { sourceEntityId, sourceEntityType } = input;
    const status: SocialPostStatus = input.addToQueue ? "queued" : "draft";

    return runtime.deduplicated({
      success: true,
      id: slug,
      content,
      metadata: {
        title: finalTitle,
        platform,
        status,
        slug,
        ...(sourceEntityId && { sourceEntityId }),
        ...(sourceEntityType && { sourceEntityType }),
      },
      resultExtras: { slug },
    });
  },
};

/**
 * The social post's `social-post:generation`: a post from text given with
 * its title, from text the AI shapes and titles, from a source post or deck
 * it shares, or from a prompt, as the anchor in the brain's voice; a title
 * that is taken asked for again, and saved beside any post that already has
 * its id. Once written, a post asked to have an image queues its graphic.
 */
export const socialPostGeneration: EntityGenerationDeclaration<
  typeof generationJobSchema,
  typeof socialPostMetadataSchema
> = afterGeneration(
  socialPostGenerationDeclaration,
  async ({ input, outcome, jobs, retries }) => {
    if (!("written" in outcome) || !input?.generateImage) return;
    const { entityId } = outcome.written;
    const title = outcome.written.title ?? "Social Post";
    await retries.run(
      () =>
        jobs.enqueue(
          imageGenerateJobContract,
          {
            prompt: `Social media graphic for: ${title}`,
            title: `${title} Image`,
            aspectRatio: "16:9",
            targetEntityType: "social-post",
            targetEntityId: entityId,
          },
          {
            toolContext: {
              interfaceType: "job",
              actor: {
                kind: "service",
                serviceId: "social-media-generation",
              },
            },
          },
        ),
      `queue the image for social-post:${entityId}`,
      `social-image:social-post:${entityId}`,
    );
  },
);
