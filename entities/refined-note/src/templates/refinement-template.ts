import { z } from "@brains/utils/zod";
import {
  createTemplate,
  type Template,
} from "@brains/sdk/internal/presentation";

/** What the brain writes when it refines notes. */
export const refinedNoteGenerationSchema: z.ZodObject<{
  title: z.ZodString;
  summary: z.ZodString;
  body: z.ZodString;
}> = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe("A clear title for the refined note (3-8 words)"),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe("One sentence saying what the note is"),
  body: z
    .string()
    .trim()
    .min(1)
    .describe("The worked-out note in markdown, without a title heading"),
});

export type RefinedNoteGeneration = z.output<
  typeof refinedNoteGenerationSchema
>;

/**
 * Writes one worked-out note from one or more loose notes. It is written
 * from the notes it is given, not from the rest of the brain.
 */
export const refinedNoteTemplate: Template =
  createTemplate<RefinedNoteGeneration>({
    name: "refined-note:refinement",
    description:
      "Template for AI to refine loose notes into one worked-out note",
    schema: refinedNoteGenerationSchema,
    dataSourceId: "shell:ai-content",
    requiredPermission: "public",
    basePrompt: `You turn loose notes into one worked-out note.

You are given the text of one or more loose notes: quick captures, fragments, drafts. Write a single note that someone can read on its own, long after the loose notes are gone.

Guidelines:
1. Work the material out: connect what the notes say, resolve repetition, put it in a sensible order, and state plainly what follows from it. Do not just paste the notes together under headings.
2. Stay with the material: use what the notes say and do not add facts, names, numbers or claims they do not contain. When the notes disagree or leave something open, say so.
3. Stand alone: never mention the loose notes, that this was written from notes, or how it was made. No phrases like "these notes", "the first note" or "based on the above".
4. Title: clear and descriptive (3-8 words), naming what the note is about.
5. Summary: one sentence saying what the note is, readable without the body.
6. Body: markdown, organized with headings and lists where they help, starting with the content itself and without repeating the title as a heading.
7. Keep the language the notes are written in.
8. A direction from the user, when given, says what to focus on; follow it within the material.`,
  });
