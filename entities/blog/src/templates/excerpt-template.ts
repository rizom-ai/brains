import { z } from "@brains/utils/zod";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated excerpt
 */
export const blogExcerptSchema: z.ZodObject<{ excerpt: z.ZodString }> =
  z.object({
    excerpt: z
      .string()
      .describe(
        "A concise 1-2 sentence summary that captures the essence of the blog post",
      ),
  });

export type BlogExcerpt = z.output<typeof blogExcerptSchema>;

/**
 * Template for AI-powered excerpt generation
 */
export const blogExcerptTemplate: ReturnType<
  typeof createTemplate<BlogExcerpt>
> = createTemplate<BlogExcerpt>({
  name: "blog:excerpt",
  description:
    "Template for AI to generate excerpts/summaries from blog post content",
  schema: blogExcerptSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  basePrompt: `Your task is to create a short excerpt (1-2 sentences) that:
1. Captures the central idea of the blog post, not just its topic
2. Works well as a meta description for SEO
3. Is between 120-160 characters ideally

Follow the supplied style guide for voice, tone, wording and form.`,
});
