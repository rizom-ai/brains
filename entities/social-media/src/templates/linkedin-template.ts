import { z } from "@brains/utils/zod";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated LinkedIn post
 */
export const linkedinPostSchema: z.ZodObject<{
  title: z.ZodString;
  content: z.ZodString;
}> = z.object({
  title: z
    .string()
    .max(80)
    .describe(
      "A short descriptive title (3-6 words) summarizing the post topic. Used for file naming, not displayed on LinkedIn. Examples: 'Plugin System Launch', 'TypeScript Best Practices', 'Q4 Results Summary'",
    ),
  content: z
    .string()
    .describe("The LinkedIn post content, as it will be posted."),
});

export type LinkedInPost = z.output<typeof linkedinPostSchema>;

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
export const linkedinTemplate: ReturnType<typeof createTemplate<LinkedInPost>> =
  createTemplate<LinkedInPost>({
    name: "social-media:linkedin",
    description: "Template for AI to generate LinkedIn posts",
    schema: linkedinPostSchema,
    dataSourceId: "shell:ai-content",
    requiredPermission: "public",
    useKnowledgeContext: true,
    basePrompt: `Your task is to generate a LinkedIn post based on the provided context.

When source content (blog post, deck, etc.) is explicitly provided as the generation source:
- Share its central idea without reproducing the whole piece, so readers have a reason to open it
- Include the source URL when one is available and directly relevant

URL inclusion:
- Include a URL when the user asks you to share/reference existing content, or when a specific source entity is provided with a URL.
- If the prompt topic directly matches a URL-bearing context item from the knowledge base, include exactly one relevant URL.
- For general prompt-only posts, use the prompt as the source of truth. Do not introduce URLs, blog/project/deck themes, source references, or specialized framing from adjacent knowledge context unless the prompt explicitly asks for existing content or a knowledge-base URL.
- Only include a URL if it directly strengthens the post and does not distract from the requested topic.
- Do not include URLs for merely adjacent analogies or loosely related context.

LinkedIn constraints:
1. LENGTH: 150-300 words. Only the first 3 lines are visible before "see more"
2. HASHTAGS: 3-5 relevant hashtags at the end, not inline
3. RELEVANCE: Stay strictly on-topic. Every sentence should directly address the given prompt topic. Don't drift into tangential themes or generic advice
4. FOCUS: Keep the post tight and purposeful. Avoid tangential analogies, citation-like links, or source references unless they directly serve the prompt.

Follow the supplied style guide for voice, tone, wording and form, including paragraphing, openings, closings, positioning and avoided terms.`,
  });
