import { BaseJobHandler } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import { noteAdapter } from "../adapters/note-adapter";

/**
 * Input schema for note generation job
 */
export const noteGenerationJobSchema = z.object({
  prompt: z.string(),
  title: z.string().optional(),
});

export type NoteGenerationJobData = z.infer<typeof noteGenerationJobSchema>;

/**
 * Result schema for note generation job
 */
export const noteGenerationResultSchema = z.object({
  success: z.boolean(),
  entityId: z.string().optional(),
  title: z.string().optional(),
  error: z.string().optional(),
});

export type NoteGenerationResult = z.infer<typeof noteGenerationResultSchema>;

/**
 * Job handler for note generation
 * Handles AI-powered content generation and entity creation
 */
export class NoteGenerationJobHandler extends BaseJobHandler<
  "generation",
  NoteGenerationJobData,
  NoteGenerationResult
> {
  constructor(
    logger: Logger,
    private context: ServicePluginContext,
  ) {
    super(logger, {
      schema: noteGenerationJobSchema,
      jobTypeName: "note-generation",
    });
  }

  async process(
    data: NoteGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<NoteGenerationResult> {
    const { prompt } = data;
    let { title } = data;

    try {
      await progressReporter.report({
        progress: 0,
        total: 100,
        message: "Starting note generation",
      });

      await progressReporter.report({
        progress: 10,
        total: 100,
        message: "Generating note content with AI",
      });

      // Generate note content with AI
      const generated = await this.context.ai.generate<{
        title: string;
        body: string;
      }>({
        prompt,
        templateName: "note:generation",
      });

      title = title ?? generated.title;
      const body = generated.body;

      await progressReporter.report({
        progress: 50,
        total: 100,
        message: `Generated note: "${title}"`,
      });

      await progressReporter.report({
        progress: 60,
        total: 100,
        message: "Creating note entity",
      });

      // Create markdown content with frontmatter
      const noteContent = noteAdapter.createNoteContent(title, body);

      await progressReporter.report({
        progress: 80,
        total: 100,
        message: "Saving note to database",
      });

      // Create entity
      const result = await this.context.entityService.createEntity({
        id: title,
        entityType: "note",
        content: noteContent,
        metadata: {
          title,
        },
      });

      await progressReporter.report({
        progress: 100,
        total: 100,
        message: `Note "${title}" created successfully`,
      });

      return {
        success: true,
        entityId: result.entityId,
        title,
      };
    } catch (error) {
      this.logger.error("Note generation job failed", {
        error,
        jobId,
        data,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  protected override summarizeDataForLog(
    data: NoteGenerationJobData,
  ): Record<string, unknown> {
    return {
      prompt: data.prompt,
      title: data.title,
    };
  }
}
