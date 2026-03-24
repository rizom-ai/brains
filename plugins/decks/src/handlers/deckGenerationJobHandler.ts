import {
  BaseGenerationJobHandler,
  ensureUniqueTitle,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import type { GeneratedContent } from "@brains/plugins";
import type { EntityPluginContext } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z, slugify, generationResultSchema } from "@brains/utils";

/**
 * Input schema for deck generation job
 */
export const deckGenerationJobSchema = z.object({
  prompt: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  event: z.string().optional(),
  skipAi: z.boolean().optional(),
});

export type DeckGenerationJobData = z.infer<typeof deckGenerationJobSchema>;

export const deckGenerationResultSchema = generationResultSchema.extend({
  title: z.string().optional(),
  slug: z.string().optional(),
});

export type DeckGenerationResult = z.infer<typeof deckGenerationResultSchema>;

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

      const generated = await this.context.ai.generate<{
        title: string;
        content: string;
        description: string;
      }>({
        prompt: generationPrompt,
        templateName: "decks:generation",
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
