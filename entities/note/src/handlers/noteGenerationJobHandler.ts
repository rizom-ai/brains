import { BaseGenerationJobHandler, ensureUniqueTitle } from "@brains/plugins";
import type { GeneratedContent } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { generationResultSchema } from "@brains/contracts";
import type { EntityPluginContext } from "@brains/plugins";
import { noteAdapter } from "../adapters/note-adapter";

/**
 * Input schema for note generation job
 */
export interface NoteGenerationJobData {
  prompt: string;
  title?: string | undefined;
}

export const noteGenerationJobSchema: z.ZodType<NoteGenerationJobData> =
  z.object({
    prompt: z.string(),
    title: z.string().optional(),
  });

export const noteGenerationResultSchema: ReturnType<
  typeof generationResultSchema.extend<{
    title: z.ZodOptional<z.ZodString>;
  }>
> = generationResultSchema.extend({
  title: z.string().optional(),
});

export type NoteGenerationResult = z.output<typeof noteGenerationResultSchema>;

/**
 * Job handler for note generation
 * Handles AI-powered content generation and entity creation
 */
export class NoteGenerationJobHandler extends BaseGenerationJobHandler<
  NoteGenerationJobData,
  NoteGenerationResult
> {
  constructor(logger: Logger, context: EntityPluginContext) {
    super(logger, context, {
      schema: noteGenerationJobSchema,
      jobTypeName: "note-generation",
      entityType: "note",
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

    // Ensure title doesn't collide with an existing entity
    const finalTitle = await ensureUniqueTitle({
      entityType: "note",
      title,
      deriveId: slugify,
      regeneratePrompt: "Generate a different note title on the same topic.",
      context: this.context,
    });

    return {
      id: slugify(finalTitle),
      content: noteAdapter.createNoteContent(finalTitle, generated.body),
      metadata: { title: finalTitle },
      title: finalTitle,
      resultExtras: { title: finalTitle },
      createOptions: { deduplicateId: true },
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
