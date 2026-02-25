import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { BaseJobHandler, ensureUniqueTitle } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import {
  getErrorMessage,
  z,
  slugify,
  computeContentHash,
  generationResultSchema,
} from "@brains/utils";
import type { DeckEntity } from "../schemas/deck";
import { DeckFormatter } from "../formatters/deck-formatter";

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
export class DeckGenerationJobHandler extends BaseJobHandler<
  "generation",
  DeckGenerationJobData,
  DeckGenerationResult
> {
  private formatter = new DeckFormatter();

  constructor(
    logger: Logger,
    private context: ServicePluginContext,
  ) {
    super(logger, {
      schema: deckGenerationJobSchema,
      jobTypeName: "deck-generation",
    });
  }

  async process(
    data: DeckGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<DeckGenerationResult> {
    const { prompt, author, event, skipAi } = data;
    let { title, content, description } = data;

    try {
      await progressReporter.report({
        progress: 0,
        total: 100,
        message: "Starting deck generation",
      });

      // skipAi mode: create skeleton deck with placeholders
      if (skipAi) {
        if (!title) {
          return {
            success: false,
            error: "Title is required when skipAi is true",
          };
        }

        // Use provided content or create a skeleton template
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

        await progressReporter.report({
          progress: 50,
          total: 100,
          message: "Creating skeleton deck",
        });
      }
      // Case 1: AI generates everything (title, content, description)
      else if (!title || !content) {
        await progressReporter.report({
          progress: 10,
          total: 100,
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

        await progressReporter.report({
          progress: 50,
          total: 100,
          message: `Generated deck: "${title}"`,
        });
      }
      // Case 2: User provided title+content, but no description - AI generates it
      else if (!description) {
        await progressReporter.report({
          progress: 30,
          total: 100,
          message: "Generating description with AI",
        });

        const descGenerated = await this.context.ai.generate<{
          description: string;
        }>({
          prompt: `Title: ${title}\n\nContent:\n${content}`,
          templateName: "decks:description",
        });

        description = descGenerated.description;

        await progressReporter.report({
          progress: 50,
          total: 100,
          message: "Description generated",
        });
      } else {
        await progressReporter.report({
          progress: 50,
          total: 100,
          message: "Using provided content",
        });
      }

      // Generate slug from title
      await progressReporter.report({
        progress: 60,
        total: 100,
        message: "Creating deck entity",
      });

      const slug = slugify(title);
      const now = new Date().toISOString();

      // Build the deck entity
      const deckEntity: Omit<DeckEntity, "id" | "created" | "updated"> = {
        entityType: "deck",
        content,
        contentHash: computeContentHash(content),
        title,
        description,
        author,
        status: "draft",
        event,
        metadata: {
          slug,
          title,
          status: "draft",
        },
      };

      await progressReporter.report({
        progress: 80,
        total: 100,
        message: "Saving deck to database",
      });

      // Ensure title doesn't collide with an existing entity
      const finalTitle = await ensureUniqueTitle({
        entityType: "deck",
        title,
        deriveId: (t) => t,
        regeneratePrompt:
          "Generate a different presentation deck title on the same topic.",
        context: this.context,
      });

      // Update entity data if title changed
      if (finalTitle !== title) {
        deckEntity.title = finalTitle;
        deckEntity.metadata.title = finalTitle;
        deckEntity.metadata.slug = slugify(finalTitle);
      }

      // Regenerate markdown with (possibly updated) entity data
      const finalMarkdown = this.formatter.toMarkdown({
        ...deckEntity,
        id: "temp",
        created: now,
        updated: now,
      });

      const result = await this.context.entityService.createEntity(
        {
          id: finalTitle,
          ...deckEntity,
          content: finalMarkdown,
        },
        { deduplicateId: true },
      );

      await progressReporter.report({
        progress: 100,
        total: 100,
        message: `Deck "${title}" created successfully`,
      });

      return {
        success: true,
        entityId: result.entityId,
        title,
        slug,
      };
    } catch (error) {
      this.logger.error("Deck generation job failed", {
        error,
        jobId,
        data,
      });

      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
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
