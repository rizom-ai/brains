import { z } from "@brains/utils/zod";
import { createTemplate, type Template } from "@brains/plugins";
import { NEWSLETTER_CHANNELS } from "@brains/contracts";

/**
 * Schema for AI-generated newsletter
 */
export const newsletterGenerationSchema: z.ZodObject<{
  subject: z.ZodString;
  content: z.ZodString;
}> = z.object({
  subject: z
    .string()
    .describe(
      "Email subject line, 40-60 characters. MUST reflect the specific topic from the user's prompt. Create curiosity or promise value.",
    ),
  content: z
    .string()
    .describe(
      "Newsletter body in markdown. Include: brief personal intro, main content with ## headers, closing with soft CTA. 300-600 words.",
    ),
});

export type NewsletterGeneration = z.output<typeof newsletterGenerationSchema>;

/**
 * Template for AI-powered newsletter generation
 *
 * Handles:
 * - Generation from prompts
 * - Generation based on source content (blog posts)
 */
export const generationTemplate: Template =
  createTemplate<NewsletterGeneration>({
    name: NEWSLETTER_CHANNELS.generation,
    description: "Template for AI to generate newsletter content",
    schema: newsletterGenerationSchema,
    dataSourceId: "shell:ai-content",
    requiredPermission: "public",
    useKnowledgeContext: true,
    basePrompt: `Your task is to generate a newsletter based on the user's prompt. The prompt specifies WHAT the newsletter should be about - this is your primary directive.

CRITICAL: The user's prompt defines the TOPIC and FOCUS of the newsletter. Write specifically about what they asked for.

If the prompt includes source content (blog posts):
- Bring out the key insights from each piece
- Connect the pieces into one coherent newsletter
- Summarize without reproducing them, so readers have a reason to open each one
- Include the relevant URLs

If the prompt is a topic or theme (e.g., "ecosystem architecture", "remote work tips"):
- Write original content about that specific topic

Newsletter constraints:
1. SUBJECT LINE: 40-60 characters, MUST be about the user's topic
   - The subject must directly relate to what the user asked for in their prompt
   - Bad: Generic subjects like "Newsletter #47", "Monthly Update"

2. FORMAT: Markdown. Use ## headers to separate main sections.

3. LENGTH: 300-600 words for the body content

Follow the supplied style guide for voice, tone, wording and form, including openings, paragraphing, emphasis and closings.`,
  });
