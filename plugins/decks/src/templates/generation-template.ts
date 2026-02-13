import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated slide deck
 */
export const deckGenerationSchema = z.object({
  title: z
    .string()
    .max(80)
    .describe(
      "A short, punchy title (2-5 words) that's memorable and evocative",
    ),
  content: z
    .string()
    .describe(
      "Full slide deck content in markdown format with slide separators (---). Each slide should have a header and focused content.",
    ),
  description: z
    .string()
    .describe(
      "A concise 1-2 sentence summary that captures the essence of the talk",
    ),
});

export type DeckGeneration = z.infer<typeof deckGenerationSchema>;

/**
 * Template for AI-powered slide deck generation
 */
export const deckGenerationTemplate = createTemplate<DeckGeneration>({
  name: "decks:generation",
  description: "Template for AI to generate complete slide decks from prompts",
  schema: deckGenerationSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  basePrompt: `You are creating slide decks in a distinctive voice that blends philosophy, technology, and culture.

Your task is to generate a complete slide deck based on the user's prompt.

Style guidelines:
1. Title slide: Just the title - short and punchy (2-5 words). Evocative, not corporate. Examples: "False Media", "Building in Public", "The Network State"
2. Opening slide (second slide): Hook the audience with a provocative question, relevant quote, or bold statement - not "Welcome" or agenda
3. Slide count: Keep it focused (8-15 slides). Quality over quantity.
4. Content per slide: Minimal text. One idea per slide. Let the speaker elaborate.
5. Voice: First-person when appropriate. Opinionated and direct. Skip the hedging language.
6. Examples: Use real, specific examples from the brain's context. Avoid generic hypotheticals.
7. Structure: Tell a story, not a list of features. Build an argument or narrative arc.
8. NO "Agenda" slides listing what you'll cover. Jump into the content.
9. NO generic "Questions?" or "Thank you" ending slides. End with a call to action or thought-provoking final point.
10. NO bullet-point heavy slides with 5+ items. If you have that much, split into multiple slides.

Format requirements:
- Use "---" on its own line to separate slides
- Each slide needs a header (# for title slide, ## for content slides)
- Use code blocks (\`\`\`) for technical examples when relevant

The tone should feel like a talk from someone who builds things and thinks deeply about them - not a corporate deck or sales pitch.`,
});
