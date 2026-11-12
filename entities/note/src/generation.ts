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
import { noteContent } from "./lib/note-markdown";
import type { noteMetadataSchema } from "./schemas/note";

/** Input schema for note generation job */
export const noteGenerationJobSchema: z.ZodObject<{
  prompt: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
}> = z.object({
  prompt: z.string(),
  title: z.string().optional(),
});

export type NoteGenerationJobData = z.output<typeof noteGenerationJobSchema>;

/** Shape the note generation template returns. */
export const generatedNoteSchema: z.ZodObject<{
  title: z.ZodString;
  body: z.ZodString;
}> = z.object({ title: z.string(), body: z.string() });

/**
 * The note's `note:generation`: a note written from a prompt through the
 * note's generation template, under a title that is free, saved beside any
 * note that already has its id.
 */
export const noteGeneration: EntityGenerationDeclaration<
  typeof noteGenerationJobSchema,
  typeof noteMetadataSchema
> = {
  input: noteGenerationJobSchema,
  generate: async (
    context,
  ): Promise<EntityGenerationResult<typeof noteMetadataSchema>> => {
    const { input, ai, progress } = context;
    const runtime = entityRuntime(context);
    await progress.report({
      progress: 10,
      message: "Generating note content with AI",
    });
    const generated = await ai.generate(
      {
        template: "generation",
        prompt: input.prompt,
        representedIdentity: "none",
      },
      generatedNoteSchema,
    );
    const title = input.title ?? generated.title;
    await progress.report({
      progress: 50,
      message: `Generated note: "${title}"`,
    });
    // Ensure title doesn't collide with an existing entity
    const finalTitle = await ensureUniqueTitle({
      entityType: "note",
      title,
      deriveId: slugify,
      regeneratePrompt: "Generate a different note title on the same topic.",
      context: uniqueTitleContext(runtime),
    });
    const note = noteContent(finalTitle, generated.body);
    return runtime.deduplicated({
      success: true,
      id: slugify(finalTitle),
      content: note.content,
      metadata: {
        title: note.title,
        ...(note.titleStated && { titleStated: true }),
      },
      resultExtras: { title: finalTitle },
    });
  },
};
