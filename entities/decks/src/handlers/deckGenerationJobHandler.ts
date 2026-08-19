import {
  ensureUniqueTitle,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import type { EntityGenerationDeclaration } from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { generationResultSchema } from "@brains/contracts";

/**
 * Input schema for deck generation job
 */
export const deckGenerationJobSchema: z.ZodObject<{
  prompt: z.ZodOptional<z.ZodString>;
  title: z.ZodOptional<z.ZodString>;
  content: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  author: z.ZodOptional<z.ZodString>;
  event: z.ZodOptional<z.ZodString>;
  skipAi: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  prompt: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  event: z.string().optional(),
  skipAi: z.boolean().optional(),
});

export type DeckGenerationJobData = z.output<typeof deckGenerationJobSchema>;

const DEFAULT_DECK_PROMPT =
  "Create a presentation about an interesting topic from my knowledge base";

const SKELETON_DECK = (title: string): string =>
  [
    `# ${title}`,
    "",
    "---",
    "",
    "# Introduction",
    "",
    "Add your introduction here",
    "",
    "---",
    "",
    "# Main Content",
    "",
    "Add your main content here",
    "",
    "---",
    "",
    "# Conclusion",
    "",
    "Add your conclusion here",
  ].join("\n");

export const deckGenerationResultSchema: ReturnType<
  typeof generationResultSchema.extend<{
    title: z.ZodOptional<z.ZodString>;
    slug: z.ZodOptional<z.ZodString>;
  }>
> = generationResultSchema.extend({
  title: z.string().optional(),
  slug: z.string().optional(),
});

export type DeckGenerationResult = z.output<typeof deckGenerationResultSchema>;

/**
 * Deck generation, declared.
 *
 * The runtime validates input and owns the job; this supplies the work and
 * creates the deck. `skipAi` produces a skeleton so an author can start from
 * a structure rather than a blank slide.
 */
export const deckGeneration: EntityGenerationDeclaration<
  typeof deckGenerationJobSchema
> = {
  input: deckGenerationJobSchema,
  generate: async ({ input, ai, logger, entities, progress }) => {
    const { prompt, author, event, skipAi } = input;
    let { title, content, description } = input;

    if (skipAi) {
      if (!title)
        return {
          success: false,
          error: "Title is required when skipAi is true",
        };
      content = content ?? SKELETON_DECK(title);
      description = description ?? `Presentation: ${title}`;
      await progress.report({
        progress: 50,
        total: 100,
        message: "Creating skeleton deck",
      });
    } else if (!title || !content) {
      await progress.report({
        progress: 10,
        total: 100,
        message: "Generating slide deck content with AI",
      });
      const voiceGuidance = formatVoiceGuidance(
        await fetchStyleGuide(entities),
      );
      const generated = await ai.generate<{
        title: string;
        content: string;
        description: string;
      }>({
        prompt: `${prompt ?? DEFAULT_DECK_PROMPT}${event ? `\n\nNote: This presentation is for "${event}".` : ""}`,
        templateName: "decks:generation",
        representedIdentity: "anchor",
        ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
      });
      title = title ?? generated.title;
      content = content ?? generated.content;
      description = description ?? generated.description;
      await progress.report({
        progress: 50,
        total: 100,
        message: `Generated deck: "${title}"`,
      });
    } else if (!description) {
      await progress.report({
        progress: 30,
        total: 100,
        message: "Generating description with AI",
      });
      const descGenerated = await ai.generate<{ description: string }>({
        prompt: `Title: ${title}\n\nContent:\n${content}`,
        templateName: "decks:description",
        representedIdentity: "none",
      });
      description = descGenerated.description;
    }

    if (!title || !content) {
      return { success: false, error: "Title and content are required" };
    }

    const finalTitle = await ensureUniqueTitle({
      entityType: "deck",
      title,
      deriveId: (candidate) => candidate,
      regeneratePrompt:
        "Generate a different presentation deck title on the same topic.",
      context: { entityService: entities, ai, logger },
    });
    const slug = slugify(finalTitle);

    await progress.report({
      progress: 100,
      total: 100,
      message: `Wrote deck: "${finalTitle}"`,
    });
    // Content, not an entity: the runtime decides whether this fills in a
    // pre-allocated deck or creates a new one.
    return {
      success: true,
      content: generateMarkdownWithFrontmatter(content, {
        title: finalTitle,
        status: "draft",
        slug,
        description,
        author,
        event,
      }),
      metadata: { slug, title: finalTitle, status: "draft" },
      resultExtras: { title: finalTitle, slug },
    };
  },
};
