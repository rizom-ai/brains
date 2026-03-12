import { BaseGenerationJobHandler } from "@brains/plugins";
import type { GeneratedContent } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z, generationResultSchema } from "@brains/utils";
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

export const noteGenerationResultSchema = generationResultSchema.extend({
  title: z.string().optional(),
});

export type NoteGenerationResult = z.infer<typeof noteGenerationResultSchema>;

/**
 * Job handler for note generation
 * Handles AI-powered content generation and entity creation
 */
export class NoteGenerationJobHandler extends BaseGenerationJobHandler<
  NoteGenerationJobData,
  NoteGenerationResult
> {
  constructor(logger: Logger, context: ServicePluginContext) {
    super(logger, context, {
      schema: noteGenerationJobSchema,
      jobTypeName: "note-generation",
      entityType: "base",
    });
  }

  protected async generate(
    data: NoteGenerationJobData,
    progressReporter: ProgressReporter,
  ): Promise<GeneratedContent> {
    await this.reportProgress(progressReporter, {
      progress: 10,
      message: "Generating note content with AI",
    });

    const generated = await this.context.ai.generate<{
      title: string;
      body: string;
    }>({
      prompt: data.prompt,
      templateName: "note:generation",
    });

    const title = data.title ?? generated.title;

    await this.reportProgress(progressReporter, {
      progress: 50,
      message: `Generated note: "${title}"`,
    });

    return {
      id: title,
      content: noteAdapter.createNoteContent(title, generated.body),
      metadata: { title },
      title,
      resultExtras: { title },
    };
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
