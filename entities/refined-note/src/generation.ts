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
import type { refinedNoteMetadataSchema } from "./schemas/refined-note";
import { refinedNoteGenerationSchema } from "./templates/refinement-template";

/** The type a refined note is written from, and uses up. */
export const REFINED_FROM = "note";

/**
 * What a refined note's generation is queued with: the notes it is written
 * from, in the fields `system_generate` writes a source in, and optionally a
 * direction and a title.
 */
export const refinedNoteGenerationJobSchema: z.ZodObject<{
  prompt: z.ZodOptional<z.ZodString>;
  title: z.ZodOptional<z.ZodString>;
  sourceEntityType: z.ZodOptional<z.ZodString>;
  sourceEntityId: z.ZodOptional<z.ZodString>;
  sourceEntityIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  prompt: z.string().optional().describe("What the writing should focus on"),
  title: z.string().optional(),
  sourceEntityType: z.string().optional(),
  sourceEntityId: z.string().optional(),
  sourceEntityIds: z.array(z.string()).optional(),
});

export type RefinedNoteGenerationJobData = z.output<
  typeof refinedNoteGenerationJobSchema
>;

/** The ids of the notes a request names, each once, in order. */
function namedNotes(input: RefinedNoteGenerationJobData): string[] {
  if (input.sourceEntityType !== REFINED_FROM) return [];
  return [
    ...new Set([
      ...(input.sourceEntityId ? [input.sourceEntityId] : []),
      ...(input.sourceEntityIds ?? []),
    ]),
  ];
}

/** A note as the writing reads it: its title over its text. */
function material(note: {
  readonly content: string;
  readonly metadata: Record<string, unknown>;
}): string {
  const title = note.metadata["title"];
  return typeof title === "string" && title.trim() && title !== "Untitled"
    ? `${title.trim()}\n\n${note.content.trim()}`
    : note.content.trim();
}

/**
 * What the writing is asked: the direction its caller gave, when there is
 * one, then each note's text, set apart from the others.
 */
export function refinementPrompt(
  texts: readonly string[],
  direction?: string,
): string {
  return [
    ...(direction ? [`Direction: ${direction}`] : []),
    ...texts.map((text, index) =>
      texts.length === 1
        ? `The loose note:\n\n${text}`
        : `Loose note ${index + 1} of ${texts.length}:\n\n${text}`,
    ),
  ].join("\n\n---\n\n");
}

/**
 * The refined note's `refined-note:generation`: one worked-out note written
 * from the text of one or more notes, read as its requester. It answers
 * with the note alone; the runtime saves it no more visibly than the notes
 * it came from and then removes them, since the type uses them up.
 */
export const refinedNoteGeneration: EntityGenerationDeclaration<
  typeof refinedNoteGenerationJobSchema,
  typeof refinedNoteMetadataSchema
> = {
  input: refinedNoteGenerationJobSchema,
  generate: async (
    context,
  ): Promise<EntityGenerationResult<typeof refinedNoteMetadataSchema>> => {
    const { input, ai, progress } = context;
    const runtime = entityRuntime(context);
    const ids = namedNotes(input);
    if (ids.length === 0) {
      return {
        success: false,
        error: "A refined note is written from one or more notes.",
      };
    }
    const notes = await Promise.all(
      ids.map(async (id) => ({
        id,
        note: await runtime.anyEntities.getEntity({
          entityType: REFINED_FROM,
          id,
        }),
      })),
    );
    const missing = notes.find(({ note }) => note === null);
    if (missing) {
      return { success: false, error: `Note not found: ${missing.id}` };
    }
    await progress.report({
      progress: 10,
      message:
        ids.length === 1
          ? "Refining the note"
          : `Refining ${ids.length} notes into one`,
    });
    const texts = notes.flatMap(({ note }) => (note ? [material(note)] : []));
    const generated = await ai.generate(
      {
        template: "refinement",
        prompt: refinementPrompt(texts, input.prompt),
        representedIdentity: "none",
      },
      refinedNoteGenerationSchema,
    );
    const title = input.title ?? generated.title;
    await progress.report({
      progress: 50,
      message: `Wrote refined note: "${title}"`,
    });
    const finalTitle = await ensureUniqueTitle({
      entityType: "refined-note",
      title,
      deriveId: slugify,
      regeneratePrompt:
        "Give this refined note a different title for the same content.",
      context: uniqueTitleContext(runtime),
    });
    return runtime.deduplicated({
      success: true,
      id: slugify(finalTitle),
      content: generated.body,
      metadata: { title: finalTitle, summary: generated.summary },
      resultExtras: { title: finalTitle },
    });
  },
};
