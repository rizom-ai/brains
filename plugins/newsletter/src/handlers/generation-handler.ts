import {
  BaseJobHandler,
  ensureUniqueTitle,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import {
  z,
  slugify,
  PROGRESS_STEPS,
  type GenerationResult,
} from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { NewsletterConfig } from "../config";
import type { NewsletterMetadata } from "../schemas/newsletter";

/**
 * Input schema for newsletter generation job
 */
export const generationJobSchema = z.object({
  prompt: z.string().optional().describe("AI generation prompt"),
  sourceEntityIds: z
    .array(z.string())
    .optional()
    .describe("Entity IDs to include in newsletter (e.g., blog posts)"),
  sourceEntityType: z
    .enum(["post"])
    .optional()
    .describe("Type of source entities"),
  content: z.string().optional().describe("Direct content (skip AI)"),
  subject: z
    .string()
    .optional()
    .describe("Newsletter subject (AI-generated if not provided)"),
  addToQueue: z
    .boolean()
    .optional()
    .describe("Create as queued (true) or draft (false)"),
});

export type GenerationJobData = z.infer<typeof generationJobSchema>;

import type { BlogPost } from "./types";

/**
 * Job handler for newsletter generation
 * Handles AI-powered content generation from prompts or source entities
 */
export class GenerationJobHandler extends BaseJobHandler<
  "newsletter-generation",
  GenerationJobData,
  GenerationResult
> {
  constructor(
    logger: Logger,
    private context: ServicePluginContext,
    _config: NewsletterConfig, // Config available for future extensions
  ) {
    super(logger, {
      jobTypeName: "newsletter-generation",
      schema: generationJobSchema,
    });
  }

  async process(
    data: GenerationJobData,
    _jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<GenerationResult> {
    const addToQueue = data.addToQueue ?? false;
    const { prompt, sourceEntityIds, sourceEntityType } = data;
    let { content, subject } = data;

    try {
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.START,
        message: "Starting newsletter generation",
      });

      // Case 1: Direct content provided (no AI needed)
      if (content) {
        if (!subject) {
          return {
            success: false,
            error: "Subject is required when providing content directly",
          };
        }
        await this.reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.GENERATE,
          message: "Using provided content",
        });
      }
      // Case 2: Generate from source entities (blog posts)
      else if (sourceEntityIds && sourceEntityIds.length > 0) {
        const entityType = sourceEntityType ?? "post";

        await this.reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.INIT,
          message: `Fetching ${sourceEntityIds.length} source entities`,
        });

        // Fetch all source entities
        const posts: BlogPost[] = [];
        for (const id of sourceEntityIds) {
          const entity = await this.context.entityService.getEntity<BlogPost>(
            entityType,
            id,
          );
          if (entity) {
            posts.push(entity);
          }
        }

        if (posts.length === 0) {
          return {
            success: false,
            error: `No source entities found for IDs: ${sourceEntityIds.join(", ")}`,
          };
        }

        await this.reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.FETCH,
          message: `Generating newsletter from ${posts.length} posts`,
        });

        // Build summary of posts for AI
        const postSummaries = posts
          .map(
            (p) =>
              `## ${p.metadata.title}\n\n${p.metadata.excerpt ?? p.content.slice(0, 500)}`,
          )
          .join("\n\n---\n\n");

        // Generate newsletter content using AI
        // Include user's prompt as additional guidance if provided
        const baseInstructions = `Create an engaging newsletter that highlights these blog posts:

${postSummaries}

The newsletter should:
- Have a compelling subject line
- Include a brief intro welcoming readers
- Summarize each post with a call-to-action to read more
- Have a friendly sign-off`;

        const finalPrompt = prompt
          ? `${baseInstructions}\n\nAdditional instructions: ${prompt}`
          : baseInstructions;

        const generated = await this.context.ai.generate<{
          subject: string;
          content: string;
        }>({
          prompt: finalPrompt,
          templateName: "newsletter:generation",
        });

        subject = subject ?? generated.subject;
        content = generated.content;

        await this.reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.GENERATE,
          message: "Newsletter generated from posts",
        });
      }
      // Case 3: Generate from prompt
      else if (prompt) {
        await this.reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.INIT,
          message: "Generating newsletter with AI",
        });

        // Generate newsletter from prompt
        const generated = await this.context.ai.generate<{
          subject: string;
          content: string;
        }>({
          prompt: prompt,
          templateName: "newsletter:generation",
        });

        subject = subject ?? generated.subject;
        content = generated.content;

        await this.reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.GENERATE,
          message: "Newsletter generated",
        });
      } else {
        return {
          success: false,
          error:
            "No content source provided (prompt, sourceEntityIds, or content)",
        };
      }

      // Create newsletter entity
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.EXTRACT,
        message: "Creating newsletter entity",
      });

      // Validate content and subject are set
      if (!content || !subject) {
        return {
          success: false,
          error: "Content or subject was not generated",
        };
      }

      // Determine status
      const status = addToQueue ? "queued" : "draft";

      // Create metadata
      const metadata: NewsletterMetadata = {
        subject,
        status,
        ...(sourceEntityIds && { entityIds: sourceEntityIds }),
        ...(sourceEntityType && { sourceEntityType }),
      };

      // Generate markdown with frontmatter
      const markdownContent = generateMarkdownWithFrontmatter(
        content,
        metadata,
      );

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.SAVE,
        message: "Saving newsletter to database",
      });

      // Ensure subject doesn't collide with an existing entity
      const finalSubject = await ensureUniqueTitle({
        entityType: "newsletter",
        title: subject,
        deriveId: slugify,
        regeneratePrompt:
          "Generate a different newsletter subject line on the same topic.",
        context: this.context,
      });

      // Update metadata if subject changed
      if (finalSubject !== subject) {
        metadata.subject = finalSubject;
      }

      const result = await this.context.entityService.createEntity(
        {
          id: slugify(finalSubject),
          entityType: "newsletter",
          content: markdownContent,
          metadata,
        },
        { deduplicateId: true },
      );

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.COMPLETE,
        message: `Newsletter created${addToQueue ? " and queued" : " as draft"}`,
      });

      await this.context.messaging.send("generate:report:success", {
        entityType: "newsletter",
        entityId: result.entityId,
      });

      return {
        success: true,
        entityId: result.entityId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error("Newsletter generation job failed", {
        error,
      });

      await this.context.messaging.send("generate:report:failure", {
        entityType: "newsletter",
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  protected override summarizeDataForLog(
    data: GenerationJobData,
  ): Record<string, unknown> {
    return {
      hasPrompt: !!data.prompt,
      sourceEntityCount: data.sourceEntityIds?.length ?? 0,
      sourceEntityType: data.sourceEntityType,
      addToQueue: data.addToQueue ?? false,
    };
  }
}
