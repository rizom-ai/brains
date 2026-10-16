import { z } from "@brains/utils/zod";
import { createTemplate, type Template } from "@brains/templates";

export const seriesDescriptionSchema: z.ZodObject<{
  description: z.ZodString;
}> = z.object({
  description: z
    .string()
    .describe(
      "A 2-3 sentence description of the series that captures its theme",
    ),
});

export type SeriesDescription = z.output<typeof seriesDescriptionSchema>;

export const seriesDescriptionTemplate: Template =
  createTemplate<SeriesDescription>({
    name: "series:description",
    description:
      "Template for AI to generate series descriptions from member summaries",
    schema: seriesDescriptionSchema,
    dataSourceId: "shell:ai-content",
    requiredPermission: "public",
    basePrompt: `Your task is to write a series description (2-3 sentences) that:
1. Captures the main theme connecting all the content
2. Says what the series covers that its parts do not on their own
3. Works well as a series overview on a website

Follow the supplied style guide for voice, tone, wording and form.`,
  });
