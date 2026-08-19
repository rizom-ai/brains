import { ensureUniqueTitle } from "@brains/sdk/entities";
import type { EntityGenerationDeclaration } from "@brains/sdk/entities";
import { slugify } from "@brains/sdk/entities";
import { z } from "@brains/sdk/entities";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/sdk/entities";
import type { SocialPostFrontmatter } from "../schemas/social-post";
import { socialPostAdapter } from "../adapters/social-post-adapter";
import { getTemplateName } from "../templates";

/**
 * Input schema for social post generation job
 */
export interface GenerationJobData {
  prompt?: string | undefined;
  platform?: "linkedin" | undefined;
  sourceEntityType?: "post" | "deck" | undefined;
  sourceEntityId?: string | undefined;
  title?: string | undefined;
  content?: string | undefined;
  addToQueue?: boolean | undefined;
}

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
});

/**
 * Social post generation, declared.
 *
 * Four ways in: content with a title needs no AI at all, content without one
 * is shaped by AI, a source entity is promoted, and a bare prompt is written
 * from scratch.
 */
export const socialPostGeneration: EntityGenerationDeclaration<
  typeof generationJobSchema
> = {
  input: generationJobSchema,
  generate: async ({ input, ai, logger, entities, progress }) => {
    const platform = input.platform ?? "linkedin";
    const addToQueue = input.addToQueue ?? false;
    const { prompt, sourceEntityType, sourceEntityId } = input;
    let { content, title } = input;

    const voiceGuidance =
      content && title
        ? ""
        : formatVoiceGuidance(await fetchStyleGuide(entities));
    const styleContext = {
      representedIdentity: "anchor" as const,
      ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
    };

    // Case 1: Direct content with title (no AI needed)
    if (content && title) {
      await progress.report({
        progress: 50,
        total: 100,
        message: "Using provided content",
      });
    }
    // Case 1b: Content without title — pass through AI to shape and title it
    else if (content && !title) {
      await progress.report({
        progress: 10,
        total: 100,
        message: "Shaping content with AI",
      });

      const generated = await ai.generate<{ title: string; content: string }>({
        prompt: content,
        templateName: getTemplateName(platform),
        ...styleContext,
      });

      title = generated.title;
      content = generated.content;

      await progress.report({
        progress: 50,
        total: 100,
        message: "Social post shaped from content",
      });
    }
    // Case 2: Generate from source entity
    else if (sourceEntityId && sourceEntityType) {
      await progress.report({
        progress: 10,
        total: 100,
        message: `Fetching source ${sourceEntityType}`,
      });

      const sourceEntity = await entities.getEntity({
        entityType: sourceEntityType,
        id: sourceEntityId,
      });

      if (!sourceEntity) {
        return {
          success: false,
          error: `Source entity not found: ${sourceEntityType}/${sourceEntityId}`,
        };
      }

      await progress.report({
        progress: 30,
        total: 100,
        message: "Generating social post from source content",
      });

      const slugSchema = z.looseObject({ slug: z.string() });
      const parsed = slugSchema.safeParse(sourceEntity.metadata);
      const slug = parsed.success ? parsed.data.slug : sourceEntityId;

      const generated = await ai.generate<{ title: string; content: string }>({
        prompt: `Create an engaging ${platform} post to promote this ${sourceEntityType}:

Source: ${sourceEntityType}/${slug}

${sourceEntity.content}`,
        templateName: getTemplateName(platform),
        ...styleContext,
      });

      title = generated.title;
      content = generated.content;

      await progress.report({
        progress: 50,
        total: 100,
        message: "Social post generated from source",
      });
    }
    // Case 3: Generate from prompt
    else if (prompt) {
      await progress.report({
        progress: 10,
        total: 100,
        message: "Generating social post with AI",
      });

      const generated = await ai.generate<{ title: string; content: string }>({
        prompt,
        templateName: getTemplateName(platform),
        ...styleContext,
      });

      title = generated.title;
      content = generated.content;

      await progress.report({
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

    if (!content || !title) {
      return { success: false, error: "Content or title was not generated" };
    }

    const status = addToQueue ? "queued" : "draft";
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
    // deriveMetadata parses or throws; the old adapter returned a partial
    // entity whose metadata could be absent, which this used to guard.
    const metadata = socialPostAdapter.deriveMetadata(postContent);

    // A post is stored under `<platform>-<slug>`, so a colliding title would
    // collide as an id too.
    const finalTitle = await ensureUniqueTitle({
      entityType: "social-post",
      title,
      deriveId: (candidate) => `${platform}-${slugify(candidate)}`,
      regeneratePrompt:
        "Generate a different social media post title on the same topic.",
      context: { entityService: entities, ai, logger },
    });

    let finalContent = postContent;
    if (finalTitle !== title) {
      metadata.title = finalTitle;
      metadata.slug = `${platform}-${slugify(finalTitle)}`;
      finalContent = socialPostAdapter.createPostContent(
        { ...frontmatter, title: finalTitle },
        content,
      );
    }

    await progress.report({
      progress: 100,
      total: 100,
      message: `Wrote social post: "${finalTitle}"`,
    });
    // Content, not an entity: the runtime decides whether this fills in a
    // pre-allocated post or creates a new one.
    return {
      success: true,
      id: metadata.slug,
      content: finalContent,
      metadata,
      resultExtras: { slug: metadata.slug },
    };
  },
};
