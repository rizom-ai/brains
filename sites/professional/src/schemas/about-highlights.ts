import { z } from "@brains/utils/zod";

/**
 * A short, knowledge-derived portrait shown under the about page. This is the
 * default site's one generated section: it exists so that site content
 * generation always has a real target, and it renders only once generated.
 */
export const aboutHighlightsSchema: z.ZodObject<{
  headline: z.ZodString;
  summary: z.ZodString;
  themes: z.ZodArray<z.ZodString>;
}> = z.object({
  headline: z
    .string()
    .describe(
      "One sentence of at most 90 characters naming what this person is known for",
    ),
  summary: z
    .string()
    .describe(
      "Two or three sentences in the third person on their current work and how they approach it",
    ),
  themes: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe(
      "Two to five short recurring themes in their work, three words or fewer each",
    ),
});

export type AboutHighlights = z.output<typeof aboutHighlightsSchema>;
