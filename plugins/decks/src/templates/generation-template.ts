import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated slide deck
 */
export const deckGenerationSchema = z.object({
  title: z.string().describe("A clear, compelling title for the presentation"),
  content: z
    .string()
    .describe(
      "Full slide deck content in markdown format with slide separators (---). Each slide should have a header and concise bullet points or content.",
    ),
  description: z
    .string()
    .describe(
      "A brief 1-2 sentence description of what the presentation covers",
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
  basePrompt: `You are an expert presentation designer creating compelling slide decks.

Your task is to generate a complete slide deck based on the user's prompt.

Guidelines:
1. Title: Create a clear, engaging title that captures the presentation topic
2. Content: Write well-structured markdown slides with:
   - Use "---" on its own line to separate slides
   - Each slide should have a clear header (# or ##)
   - Keep content concise - bullet points work well
   - Include 5-10 slides typically
   - Structure: Title slide → Introduction → Main points → Conclusion
   - Use code blocks (\`\`\`) for technical examples if relevant
3. Description: Write a 1-2 sentence summary of the presentation

Example slide structure:
\`\`\`
# Presentation Title

---

## Introduction

- Key point 1
- Key point 2

---

## Main Topic

Content here...

---

## Conclusion

- Summary point 1
- Summary point 2
\`\`\`

Create engaging, informative slides that would work well for a professional presentation.`,
});
