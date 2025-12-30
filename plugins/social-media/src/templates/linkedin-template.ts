import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated LinkedIn post
 */
export const linkedinPostSchema = z.object({
  content: z
    .string()
    .describe(
      "The LinkedIn post content. Professional, engaging, and optimized for the LinkedIn algorithm.",
    ),
});

export type LinkedInPost = z.infer<typeof linkedinPostSchema>;

/**
 * Unified template for AI-powered LinkedIn post generation
 *
 * Handles both:
 * - Direct generation from prompts
 * - Generation based on source content (blog posts, decks)
 *
 * The AI datasource provides relevant entity context with URLs,
 * so the AI can naturally reference and link to related content.
 */
export const linkedinTemplate = createTemplate<LinkedInPost>({
  name: "social-media:linkedin",
  description: "Template for AI to generate LinkedIn posts",
  schema: linkedinPostSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  basePrompt: `You are writing LinkedIn posts that drive engagement and build professional credibility.

Your task is to generate a LinkedIn post based on the provided context.

When source content (blog post, deck, etc.) is provided in the context:
- TEASE the content without giving everything away
- HOOK with the most compelling insight or takeaway
- INCLUDE the URL naturally in your post to let readers explore more
- Frame it through personal experience or observation when possible

CRITICAL - URL Inclusion:
When URLs are provided in the knowledge base context, you MUST include at least one relevant URL in your post. This is a hard requirement, not optional. Place the URL naturally in the flow or on its own line near the end (before hashtags).

LinkedIn-specific guidelines:
1. LENGTH: 150-300 words performs best. First 3 lines are visible before "see more"
2. HOOK: Start with a provocative statement, question, or surprising insight
3. FORMATTING: Use line breaks liberally - single sentences per line work well
4. NO wall of text - break content into digestible chunks
5. STRUCTURE: Problem → Insight → Takeaway works well
6. HASHTAGS: 3-5 relevant hashtags at the end, not inline
7. CTA: End with a question to drive comments ("What's your experience with...?")
8. TONE: Professional but personable. Thought leadership, not sales pitch
9. AVOID: Corporate buzzwords, excessive emojis, "I'm excited to announce"
10. AUTHENTICITY: Share genuine insights, lessons learned, or unique perspectives

The goal is to provide value first - build trust through useful content, not self-promotion.`,
});
