import { z } from "@brains/utils/zod-v4";
import { createTemplate, type Template } from "@brains/templates";

export interface SeriesDescription {
  description: string;
}

export const seriesDescriptionSchema: z.ZodType<SeriesDescription> = z.object({
  description: z
    .string()
    .describe(
      "A compelling 2-3 sentence description of the series that captures its theme and value",
    ),
});

export const seriesDescriptionTemplate: Template =
  createTemplate<SeriesDescription>({
    name: "series:description",
    description:
      "Template for AI to generate series descriptions from member summaries",
    schema: seriesDescriptionSchema,
    dataSourceId: "shell:ai-content",
    requiredPermission: "public",
    basePrompt: `You are an expert at writing compelling content descriptions.

Your task is to write a series description (2-3 sentences) that:
1. Captures the main theme connecting all the content
2. Highlights the value readers will get from the series
3. Is engaging and makes readers want to explore the content
4. Works well as a series overview on a website

Be concise and focus on what makes this series unique and valuable.`,
  });
