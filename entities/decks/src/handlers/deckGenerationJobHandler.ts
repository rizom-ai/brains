import {
  ensureUniqueTitle,
  generateMarkdownWithFrontmatter,
} from "@brains/sdk/entities";
import type { EntityGenerationDeclaration } from "@brains/sdk/entities";
import { slugify } from "@brains/sdk/entities";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/sdk/entities";
import { z } from "@brains/sdk/entities";

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
  generate: async ({ input, ai, logger, entities, progress, template }) => {
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
      const generated = await ai.generate(
        {
          prompt: `${prompt ?? DEFAULT_DECK_PROMPT}${event ? `\n\nNote: This presentation is for "${event}".` : ""}`,
          templateName: template("generation"),
          representedIdentity: "anchor",
          ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
        },
        z.object({
          title: z.string(),
          content: z.string(),
          description: z.string(),
        }),
      );
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
      const descGenerated = await ai.generate(
        {
          prompt: `Title: ${title}\n\nContent:\n${content}`,
          templateName: template("description"),
          representedIdentity: "none",
        },
        z.object({ description: z.string() }),
      );
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
      // The title, not its slug: deck files are named after the id.
      id: finalTitle,
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
