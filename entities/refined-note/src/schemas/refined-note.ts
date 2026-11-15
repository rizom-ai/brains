import { z } from "@brains/utils/zod";

/** Set by the generation that writes the refined note. */
export const refinedNoteStatusSchema: z.ZodEnum<{
  generating: "generating";
  failed: "failed";
}> = z.enum(["generating", "failed"]);

export type RefinedNoteStatus = z.output<typeof refinedNoteStatusSchema>;

/**
 * A refined note's frontmatter, which is its metadata. Unlike a plain note
 * it must state its title and say in one sentence what it is. Only the
 * placeholder of a generation, queued or failed, goes without a summary.
 */
export const refinedNoteMetadataSchema: z.ZodObject<{
  title: z.ZodString;
  summary: z.ZodString;
  status: z.ZodOptional<typeof refinedNoteStatusSchema>;
  error: z.ZodOptional<z.ZodString>;
}> = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "A refined note states its title")
      .describe("The note's title"),
    summary: z.string().trim().describe("One sentence saying what the note is"),
    status: refinedNoteStatusSchema
      .optional()
      .meta({ studioWidget: "provenance" }),
    error: z.string().optional().meta({ studioWidget: "provenance" }),
  })
  .refine(({ status, summary }) => status !== undefined || summary.length > 0, {
    path: ["summary"],
    message: "A refined note says in one sentence what it is",
  });

export type RefinedNoteMetadata = z.output<typeof refinedNoteMetadataSchema>;
