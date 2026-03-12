import {
  BaseGenerationJobHandler,
  ensureUniqueTitle,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import type { GeneratedContent } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z, slugify, type GenerationResult } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { NewsletterConfig } from "../config";
import type { NewsletterMetadata } from "../schemas/newsletter";
import type { BlogPost } from "./types";

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

/**
 * Job handler for newsletter generation
 * Handles AI-powered content generation from prompts or source entities
 */
export class GenerationJobHandler extends BaseGenerationJobHandler<
  GenerationJobData,
  GenerationResult
> {
  constructor(
    logger: Logger,
    context: ServicePluginContext,
    _config: NewsletterConfig,
  ) {
    super(logger, context, {
      schema: generationJobSchema,
      jobTypeName: "newsletter-generation",
      entityType: "newsletter",
    });
  }

  protected async generate(
    data: GenerationJobData,
    progressReporter: ProgressReporter,
  ): Promise<GeneratedContent> {
    const addToQueue = data.addToQueue ?? false;
    const { prompt, sourceEntityIds, sourceEntityType } = data;
    let { content, subject } = data;

    // Case 1: Direct content provided
    if (content) {
      if (!subject) {
        this.failEarly("Subject is required when providing content directly");
      }
      await this.reportProgress(progressReporter, {
        progress: 50,
        message: "Using provided content",
      });
    }
    // Case 2: Generate from source entities (blog posts)
    else if (sourceEntityIds && sourceEntityIds.length > 0) {
      const entityType = sourceEntityType ?? "post";

      await this.reportProgress(progressReporter, {
        progress: 10,
        message: `Fetching ${sourceEntityIds.length} source entities`,
      });

      const results = await Promise.all(
        sourceEntityIds.map((id) =>
          this.context.entityService.getEntity<BlogPost>(entityType, id),
        ),
      );
      const posts = results.filter((e): e is BlogPost => e != null);

      if (posts.length === 0) {
        this.failEarly(
          `No source entities found for IDs: ${sourceEntityIds.join(", ")}`,
        );
      }

      await this.reportProgress(progressReporter, {
        progress: 30,
        message: `Generating newsletter from ${posts.length} posts`,
      });

      const postSummaries = posts
        .map(
          (p) =>
            `## ${p.metadata.title}\n\n${p.metadata.excerpt ?? p.content.slice(0, 500)}`,
        )
        .join("\n\n---\n\n");

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
        progress: 50,
        message: "Newsletter generated from posts",
      });
    }
    // Case 3: Generate from prompt
    else if (prompt) {
      await this.reportProgress(progressReporter, {
        progress: 10,
        message: "Generating newsletter with AI",
      });

      const generated = await this.context.ai.generate<{
        subject: string;
        content: string;
      }>({
        prompt,
        templateName: "newsletter:generation",
      });

      subject = subject ?? generated.subject;
      content = generated.content;

      await this.reportProgress(progressReporter, {
        progress: 50,
        message: "Newsletter generated",
      });
    } else {
      this.failEarly(
        "No content source provided (prompt, sourceEntityIds, or content)",
      );
    }

    if (!content || !subject) {
      this.failEarly("Content or subject was not generated");
    }

    const status = addToQueue ? "queued" : "draft";

    const metadata: NewsletterMetadata = {
      subject,
      status,
      ...(sourceEntityIds && { entityIds: sourceEntityIds }),
      ...(sourceEntityType && { sourceEntityType }),
    };

    const markdownContent = generateMarkdownWithFrontmatter(content, metadata);

    const finalSubject = await ensureUniqueTitle({
      entityType: "newsletter",
      title: subject,
      deriveId: slugify,
      regeneratePrompt:
        "Generate a different newsletter subject line on the same topic.",
      context: this.context,
    });

    if (finalSubject !== subject) {
      metadata.subject = finalSubject;
    }

    return {
      id: slugify(finalSubject),
      content: markdownContent,
      metadata,
      title: finalSubject,
      createOptions: { deduplicateId: true },
    };
  }

  protected override async onGenerationFailure(
    _data: GenerationJobData,
    error: string,
  ): Promise<void> {
    await this.context.messaging.send("generate:report:failure", {
      entityType: "newsletter",
      error,
    });
  }

  protected override async afterCreate(
    _data: GenerationJobData,
    entityId: string,
    _progressReporter: ProgressReporter,
    _generated: GeneratedContent,
  ): Promise<void> {
    await this.context.messaging.send("generate:report:success", {
      entityType: "newsletter",
      entityId,
    });
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
