import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated series description
 */
export const seriesDescriptionSchema = z.object({
  description: z
    .string()
    .describe(
      "A compelling 2-3 sentence description of the series that captures its theme and value",
    ),
});

export type SeriesDescription = z.infer<typeof seriesDescriptionSchema>;

/**
 * Template for AI-powered series description generation
 */
export const seriesDescriptionTemplate = createTemplate<SeriesDescription>({
  name: "blog:series-description",
  description:
    "Template for AI to generate series descriptions from post summaries",
  schema: seriesDescriptionSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  basePrompt: `You are an expert at writing compelling content descriptions.

Your task is to write a series description (2-3 sentences) that:
1. Captures the main theme connecting all the posts
2. Highlights the value readers will get from the series
3. Is engaging and makes readers want to explore the posts
4. Works well as a series overview on a blog

Be concise and focus on what makes this series unique and valuable.`,
});
