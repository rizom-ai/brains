import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated LinkedIn post from source content
 */
export const linkedinFromSourceSchema = z.object({
  content: z
    .string()
    .describe(
      "The LinkedIn post content that promotes the source content effectively.",
    ),
  sourceUrl: z
    .string()
    .optional()
    .describe("URL to include in the post if the source has a public URL"),
});

export type LinkedInFromSource = z.infer<typeof linkedinFromSourceSchema>;

/**
 * Template for generating LinkedIn posts from blog posts or decks
 */
export const linkedinFromSourceTemplate = createTemplate<LinkedInFromSource>({
  name: "social-media:from-source-linkedin",
  description:
    "Template for AI to generate LinkedIn posts from blog posts or decks",
  schema: linkedinFromSourceSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  basePrompt: `You are creating a LinkedIn post to promote existing content (a blog post or presentation deck).

Your task is to write an engaging LinkedIn post that:
1. TEASES the content without giving everything away
2. HOOKS with the most compelling insight or takeaway
3. PROVIDES value standalone - the post should be useful even without clicking
4. DRIVES curiosity to read/view the full content

LinkedIn-specific guidelines:
1. LENGTH: 150-250 words - enough to provide value, short enough to retain attention
2. HOOK: Lead with the key insight or provocative question from the source
3. FORMATTING: Use line breaks liberally for readability
4. PERSONAL ANGLE: Frame it through experience or observation when possible
5. HASHTAGS: 3-5 relevant hashtags at the end
6. CTA: Natural call-to-action to check out the full content

DON'T:
- Start with "Check out my latest blog post..."
- Be overly promotional or salesy
- Use clickbait tactics
- Give away the entire content

DO:
- Share the key insight that makes it worth reading
- Add a personal perspective or context
- Make the reader curious about the details`,
});
