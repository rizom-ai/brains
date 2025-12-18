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
  basePrompt: `Write a short description (1-2 sentences) for this presentation.

Guidelines:
1. Capture the core argument or idea, not just the topic
2. Be direct and specific - avoid vague marketing language
3. Keep it concise (100-150 characters)
4. Match the voice of the presentation - if it's opinionated, the description should be too

Bad: "An exploration of modern web development practices and their implications"
Good: "Why most web frameworks are solving the wrong problems"`,
});
