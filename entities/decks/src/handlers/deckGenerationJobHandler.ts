import { generationResultSchema } from "@brains/contracts";
import type {
  EntityGenerationDeclaration,
  EntityGenerationResult,
} from "@brains/sdk/entities";
import {
  ensureUniqueTitle,
  entityRuntime,
  uniqueTitleContext,
} from "@brains/sdk/internal/entity-runtime";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { describeDeck } from "../lib/describe-deck";
import type { deckMetadataSchema } from "../schemas/deck";

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

/** Shape the deck generation template returns. */
export const generatedDeckSchema: z.ZodObject<{
  title: z.ZodString;
  content: z.ZodString;
  description: z.ZodString;
}> = z.object({
  title: z.string(),
  content: z.string(),
  description: z.string(),
});

const SKELETON = (title: string): string => `# ${title}

---

# Introduction

Add your introduction here

---

# Main Content

Add your main content here

---

# Conclusion

Add your conclusion here`;

/**
 * The deck's `deck:generation`: the slides, title and description from the
 * AI, in the brain's voice and as the anchor, or a skeleton without it; a
 * description written from given slides; a title that is taken asked for
 * again; saved as a draft beside any deck that already has its id.
 */
export const deckGeneration: EntityGenerationDeclaration<
  typeof deckGenerationJobSchema,
  typeof deckMetadataSchema
> = {
  input: deckGenerationJobSchema,
  generate: async (
    context,
  ): Promise<EntityGenerationResult<typeof deckMetadataSchema>> => {
    const { input, ai, progress } = context;
    const runtime = entityRuntime(context);
    const { prompt, author, event, skipAi } = input;
    let { title, content, description } = input;

    // skipAi mode: create skeleton deck with placeholders
    if (skipAi) {
      if (!title) {
        return {
          success: false,
          error: "Title is required when skipAi is true",
        };
      }
      content = content ?? SKELETON(title);
      description = description ?? `Presentation: ${title}`;
      await progress.report({
        progress: 50,
        message: "Creating skeleton deck",
      });
    }
    // Case 1: AI generates everything
    else if (!title || !content) {
      await progress.report({
        progress: 10,
        message: "Generating slide deck content with AI",
      });
      const finalPrompt =
        prompt ??
        "Create a presentation about an interesting topic from my knowledge base";
      const generated = await ai.generate(
        {
          template: "generation",
          prompt: `${finalPrompt}${event ? `\n\nNote: This presentation is for "${event}".` : ""}`,
          representedIdentity: "anchor",
          voice: true,
        },
        generatedDeckSchema,
      );
      title = title ?? generated.title;
      content = content ?? generated.content;
      description = description ?? generated.description;
      await progress.report({
        progress: 50,
        message: `Generated deck: "${title}"`,
      });
    }
    // Case 2: User provided title+content, but no description
    else if (!description) {
      await progress.report({
        progress: 30,
        message: "Generating description with AI",
      });
      description = await describeDeck(ai.generate, { title, content });
      await progress.report({ progress: 50, message: "Description generated" });
    } else {
      await progress.report({
        progress: 50,
        message: "Using provided content",
      });
    }

    if (!title || !content) {
      return { success: false, error: "Title and content are required" };
    }

    // Ensure title doesn't collide
    const finalTitle = await ensureUniqueTitle({
      entityType: "deck",
      title,
      deriveId: (t) => t,
      regeneratePrompt:
        "Generate a different presentation deck title on the same topic.",
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
        status: "draft" as const,
        description,
        ...(author !== undefined && { author }),
        ...(event !== undefined && { event }),
      },
      resultExtras: { title: finalTitle, slug },
    });
  },
};
