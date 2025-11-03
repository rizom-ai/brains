import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated excerpt
 */
export const blogExcerptSchema = z.object({
  excerpt: z
    .string()
    .describe(
      "A concise 1-2 sentence summary that captures the essence of the blog post",
    ),
});

export type BlogExcerpt = z.infer<typeof blogExcerptSchema>;

/**
 * Template for AI-powered excerpt generation
 */
export const blogExcerptTemplate = createTemplate<BlogExcerpt>({
  name: "blog:excerpt",
  description:
    "Template for AI to generate excerpts/summaries from blog post content",
  schema: blogExcerptSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  basePrompt: `You are an expert at writing concise, compelling summaries.

Your task is to create a short excerpt (1-2 sentences) that:
1. Captures the main topic and value of the blog post
2. Is engaging and makes readers want to read more
3. Works well as a meta description for SEO
4. Is between 120-160 characters ideally

The excerpt should be clear, concise, and compelling.`,
});
