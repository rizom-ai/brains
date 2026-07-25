import { z } from "@brains/utils/zod";
import { createTemplate, type Template } from "@brains/plugins";

/**
 * Schema for AI-generated slide deck
 */
export const deckGenerationSchema: z.ZodObject<{
  title: z.ZodString;
  content: z.ZodString;
  description: z.ZodString;
}> = z.object({
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

export type DeckGeneration = z.output<typeof deckGenerationSchema>;

/**
 * Template for AI-powered slide deck generation
 */
export const deckGenerationTemplate: Template = createTemplate<DeckGeneration>({
  name: "decks:generation",
  description: "Template for AI to generate complete slide decks from prompts",
  schema: deckGenerationSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  useKnowledgeContext: true,
  basePrompt: `Generate a complete slide deck based on the user's prompt.

Content requirements:
1. Title slide: use only a short title of 2-5 words and an optional subtitle.
2. Opening slide: start with a question, relevant quote, or clear claim rather than an agenda.
3. Keep the deck focused at 8-15 slides.
4. Use minimal text and one main idea per slide.
5. Use real, specific examples from supplied brain context when relevant.
6. Build an argument or narrative arc rather than a feature list.
7. Do not add an agenda slide.
8. Do not end with a generic "Questions?" or "Thank you" slide.
9. Split lists with 5 or more items across slides.
10. Follow the supplied style guide for voice, language, and positioning.

Format requirements:
- Use "---" on its own line to separate slides
- Each slide needs a header (# for title slide, ## for content slides)
- Use code blocks (\`\`\`) for technical examples when relevant
- The first slide is auto-centered as a title card — just use # Title and optionally a subtitle as a paragraph

Visual directives (use sparingly for emphasis — most slides need none):
- Background color: <!-- .slide: data-background-color="#1a1a2e" --> for emphasis slides
- Background image: <!-- .slide: data-background-image="url" data-background-opacity="0.3" --> (rare)
- Two-column layout: Add <!-- .break --> between left and right content
- Mermaid diagrams: Use \`\`\`mermaid code blocks for architecture/flow diagrams
- Transitions: <!-- .slide: data-transition="fade" --> for dramatic reveals

When to use directives:
- Background colors: 1-2 per deck max, for key takeaway or emphasis slides
- Columns: Comparisons, before/after, pros/cons
- Mermaid: Architecture diagrams, flowcharts, sequences — only when visual adds clarity
- Most slides should have NO directives — clean content speaks louder
`,
});
