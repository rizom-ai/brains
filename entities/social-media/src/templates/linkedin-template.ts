import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated LinkedIn post
 */
export const linkedinPostSchema = z.object({
  title: z
    .string()
    .max(80)
    .describe(
      "A short descriptive title (3-6 words) summarizing the post topic. Used for file naming, not displayed on LinkedIn. Examples: 'Plugin System Launch', 'TypeScript Best Practices', 'Q4 Results Summary'",
    ),
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
  useKnowledgeContext: true,
  basePrompt: `You are writing LinkedIn posts that drive engagement and build professional credibility.

Your task is to generate a LinkedIn post based on the provided context.

When source content (blog post, deck, etc.) is explicitly provided as the generation source:
- TEASE the content without giving everything away
- HOOK with the most compelling insight or takeaway
- INCLUDE the source URL naturally when one is available and directly relevant
- Frame it through personal experience or observation when possible

URL inclusion:
- Include a URL when the user asks you to share/reference existing content, or when a specific source entity is provided with a URL.
- If the prompt topic directly matches a URL-bearing context item from the knowledge base, include exactly one relevant URL.
- For general prompt-only posts, do not force a URL. Only include one if it directly strengthens the post and does not distract from the requested topic.
- Do not include URLs for merely adjacent analogies or loosely related context.

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
11. RELEVANCE: Stay strictly on-topic. Every sentence should directly address the given prompt topic. Don't drift into tangential themes or generic advice
12. POLISH: Keep the post tight and purposeful. Avoid tangential analogies, citation-like links, or source references unless they directly serve the prompt.

The goal is to provide value first - build trust through useful content, not self-promotion.`,
});
