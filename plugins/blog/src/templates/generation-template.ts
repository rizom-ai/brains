import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated blog post
 */
export const blogGenerationSchema = z.object({
  title: z
    .string()
    .describe(
      "A short, punchy title (2-4 words) that's memorable and evocative",
    ),
  content: z
    .string()
    .describe(
      "Blog post content in markdown format, relatively concise (30-80 lines), with flowing narrative style",
    ),
  excerpt: z
    .string()
    .describe(
      "A concise 1-2 sentence summary that captures the essence of the post",
    ),
});

export type BlogGeneration = z.infer<typeof blogGenerationSchema>;

/**
 * Template for AI-powered blog post generation
 */
export const blogGenerationTemplate = createTemplate<BlogGeneration>({
  name: "blog:generation",
  description: "Template for AI to generate complete blog posts from prompts",
  schema: blogGenerationSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  basePrompt: `You are writing blog posts in a distinctive voice that blends philosophy, technology, and culture.

Your task is to generate a complete blog post based on the user's prompt.

Style guidelines:
1. Title: Short and punchy (2-4 words). Evocative, not SEO-optimized. Examples: "False Media", "Foam Party", "The Low End Theory"
2. Opening: Start with a relevant quote - song lyrics (hip-hop, funk, etc.) or a philosopher/thinker quote in blockquote format
3. Length: Keep it focused and concise (30-80 lines). Quality over quantity.
4. Structure: Prefer flowing narrative over heavy subheading structure. Use headers sparingly, not for every paragraph.
5. Voice: First-person when appropriate. Playful and witty with occasional humor. Opinionated.
6. Examples: Use real, specific examples from the brain's context. Avoid generic hypotheticals like "imagine a company that..."
7. References: Draw on existing projects and ideas from the brain's knowledge when relevant.
8. NO "Key Takeaways" or summary bullet points at the end. Let the piece end naturally.
9. NO over-structuring with many subheadings like "### For Organizations" or "### Practical Implications"

The tone should feel like a thoughtful essay from someone who builds things and thinks deeply about them - not a consulting whitepaper or content marketing piece.`,
});
