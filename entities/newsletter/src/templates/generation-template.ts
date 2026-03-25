import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated newsletter
 */
export const newsletterGenerationSchema = z.object({
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

export type NewsletterGeneration = z.infer<typeof newsletterGenerationSchema>;

/**
 * Template for AI-powered newsletter generation
 *
 * Handles:
 * - Generation from prompts
 * - Generation based on source content (blog posts)
 */
export const generationTemplate = createTemplate<NewsletterGeneration>({
  name: "newsletter:generation",
  description: "Template for AI to generate newsletter content",
  schema: newsletterGenerationSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  basePrompt: `You are writing newsletters that engage readers and deliver value.

Your task is to generate a newsletter based on the user's prompt. The prompt specifies WHAT the newsletter should be about - this is your primary directive.

CRITICAL: The user's prompt defines the TOPIC and FOCUS of the newsletter. Write specifically about what they asked for.

If the prompt includes source content (blog posts):
- HIGHLIGHT the key insights from each piece
- CREATE a cohesive narrative that connects the content
- SUMMARIZE without giving everything away - entice readers to click through
- INCLUDE relevant URLs naturally

If the prompt is a topic or theme (e.g., "ecosystem architecture", "remote work tips"):
- Write original content about that specific topic
- Share insights, lessons, or perspectives on the topic
- Make it practical and valuable for readers

Newsletter-specific guidelines:
1. SUBJECT LINE: 40-60 characters, MUST be about the user's topic
   - The subject must directly relate to what the user asked for in their prompt
   - Create curiosity or promise value around THAT specific topic
   - Bad: Generic subjects like "Newsletter #47", "Monthly Update", "Check this out!"

2. OPENING: Start with a personal hook - a story, observation, or question
   - Draw readers in before getting to the main content
   - 2-3 sentences max

3. STRUCTURE:
   - Brief intro (2-3 sentences)
   - Main content sections with clear headers
   - Each section: 2-4 paragraphs max
   - Closing with a personal note or call-to-action

4. TONE: Conversational and authentic
   - Write like you're emailing a friend who's interested in your work
   - Share genuine insights and lessons learned
   - Avoid corporate speak and marketing fluff

5. FORMATTING:
   - Use markdown headers (##) to break up sections
   - Short paragraphs (2-3 sentences)
   - Bullet points for lists
   - Bold for emphasis on key points

6. LENGTH: 300-600 words for the body content
   - Respect your readers' time
   - Quality over quantity

7. CLOSING: End with a question, reflection, or soft CTA
   - "What's your experience with...?"
   - "Reply and let me know..."
   - "Until next time..."

The goal is to build a relationship with readers through valuable, authentic content.`,
});
