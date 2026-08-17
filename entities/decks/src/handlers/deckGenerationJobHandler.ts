import {
  BaseGenerationJobHandler,
  ensureUniqueTitle,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import type {
  GeneratedContent,
  EntityGenerationDeclaration,
} from "@brains/plugins";
import type { EntityPluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
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
 * Job handler for deck generation
 * Handles AI-powered content generation and entity creation
 */
export class DeckGenerationJobHandler extends BaseGenerationJobHandler<
  DeckGenerationJobData,
  DeckGenerationResult
> {
  constructor(logger: Logger, context: EntityPluginContext) {
    super(logger, context, {
      schema: deckGenerationJobSchema,
      jobTypeName: "deck-generation",
      entityType: "deck",
    });
  }

  protected async generate(
    data: DeckGenerationJobData,
    progressReporter: ProgressReporter,
  ): Promise<GeneratedContent> {
    const { prompt, author, event, skipAi } = data;
    let { title, content, description } = data;

    // skipAi mode: create skeleton deck with placeholders
    if (skipAi) {
      if (!title) {
        this.failEarly("Title is required when skipAi is true");
      }

      content =
        content ??
        `# ${title}

---

# Introduction

Add your introduction here

---

# Main Content

Add your main content here

---

# Conclusion

Add your conclusion here`;

      description = description ?? `Presentation: ${title}`;

      await this.reportProgress(progressReporter, {
        progress: 50,
        message: "Creating skeleton deck",
      });
    }
    // Case 1: AI generates everything
    else if (!title || !content) {
      await this.reportProgress(progressReporter, {
        progress: 10,
        message: "Generating slide deck content with AI",
      });

      const defaultPrompt =
        "Create a presentation about an interesting topic from my knowledge base";
      const finalPrompt = prompt ?? defaultPrompt;
      const generationPrompt = `${finalPrompt}${event ? `\n\nNote: This presentation is for "${event}".` : ""}`;

      const voiceGuidance = formatVoiceGuidance(
        await fetchStyleGuide(this.context.entityService),
      );
      const generated = await this.context.ai.generate<{
        title: string;
        content: string;
        description: string;
      }>({
        prompt: generationPrompt,
        templateName: "decks:generation",
        representedIdentity: "anchor",
        ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
      });

      title = title ?? generated.title;
      content = content ?? generated.content;
      description = description ?? generated.description;

      await this.reportProgress(progressReporter, {
        progress: 50,
        message: `Generated deck: "${title}"`,
      });
    }
    // Case 2: User provided title+content, but no description
    else if (!description) {
      await this.reportProgress(progressReporter, {
        progress: 30,
        message: "Generating description with AI",
      });

      const descGenerated = await this.context.ai.generate<{
        description: string;
      }>({
        prompt: `Title: ${title}\n\nContent:\n${content}`,
        templateName: "decks:description",
        representedIdentity: "none",
      });

      description = descGenerated.description;

      await this.reportProgress(progressReporter, {
        progress: 50,
        message: "Description generated",
      });
    } else {
      await this.reportProgress(progressReporter, {
        progress: 50,
        message: "Using provided content",
      });
    }

    if (!title || !content) {
      this.failEarly("Title and content are required");
    }

    const slug = slugify(title);

    const metadata = { slug, title, status: "draft" as const };

    // Ensure title doesn't collide
    const finalTitle = await ensureUniqueTitle({
      entityType: "deck",
      title,
      deriveId: (t) => t,
      regeneratePrompt:
        "Generate a different presentation deck title on the same topic.",
      context: this.context,
    });

    if (finalTitle !== title) {
      metadata.title = finalTitle;
      metadata.slug = slugify(finalTitle);
    }

    const frontmatter = {
      title: metadata.title,
      status: metadata.status,
      slug: metadata.slug,
      description,
      author,
      event,
    };

    const finalMarkdown = generateMarkdownWithFrontmatter(content, frontmatter);

    return {
      id: finalTitle,
      content: finalMarkdown,
      metadata,
      title: finalTitle,
      resultExtras: { title: finalTitle, slug: metadata.slug },
      createOptions: { deduplicateId: true },
    };
  }

  protected override summarizeDataForLog(
    data: DeckGenerationJobData,
  ): Record<string, unknown> {
    return {
      prompt: data.prompt,
      title: data.title,
    };
  }
}

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
  handle: async ({ input, ai, logger, entities, progress }) => {
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

    const result = await entities.create({
      id: finalTitle,
      entityType: "deck",
      content: generateMarkdownWithFrontmatter(content, {
        title: finalTitle,
        status: "draft",
        slug,
        description,
        author,
        event,
      }),
      metadata: { slug, title: finalTitle, status: "draft" },
    });

    await progress.report({
      progress: 100,
      total: 100,
      message: `Saved deck: "${finalTitle}"`,
    });
    return {
      success: true,
      entityId: result.entityId,
      title: finalTitle,
      slug,
    };
  },
};
