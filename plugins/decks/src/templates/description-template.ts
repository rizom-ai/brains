import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated deck description
 */
export const deckDescriptionSchema = z.object({
  description: z
    .string()
    .describe(
      "A concise 1-2 sentence description that captures the essence of the presentation",
    ),
});

export type DeckDescription = z.infer<typeof deckDescriptionSchema>;

/**
 * Template for AI-powered description generation
 */
export const deckDescriptionTemplate = createTemplate<DeckDescription>({
  name: "decks:description",
  description:
    "Template for AI to generate descriptions from slide deck content",
  schema: deckDescriptionSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  basePrompt: `You are an expert at writing concise, compelling summaries.

Your task is to create a short description (1-2 sentences) that:
1. Captures the main topic and value of the presentation
2. Is engaging and makes readers want to view the slides
3. Works well as a subtitle or preview text
4. Is between 100-150 characters ideally

The description should be clear, concise, and compelling.`,
});
