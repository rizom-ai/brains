import { z } from "@brains/utils/zod";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated blog post
 */
export interface BlogGeneration {
  title: string;
  content: string;
  excerpt: string;
}

export const blogGenerationSchema: z.ZodType<BlogGeneration> = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe(
      "A short, punchy title (2-4 words) that's memorable and evocative. Must not be empty.",
    ),
  content: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Blog post content in markdown format, relatively concise (30-80 lines), with flowing narrative style. Must not be empty.",
    ),
  excerpt: z
    .string()
    .trim()
    .min(1)
    .describe(
      "A concise 1-2 sentence summary that captures the essence of the post. Must not be empty.",
    ),
});

/**
 * Template for AI-powered blog post generation
 */
export const blogGenerationTemplate: ReturnType<
  typeof createTemplate<BlogGeneration>
> = createTemplate<BlogGeneration>({
  name: "blog:generation",
  description: "Template for AI to generate complete blog posts from prompts",
  schema: blogGenerationSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  useKnowledgeContext: true,
  basePrompt: `Generate a complete blog post from the user's prompt.

Always return non-empty values for title, content, and excerpt. Never return empty strings or placeholder-only output.

Format requirements:
1. Use a short title of 2-4 words.
2. Keep the post focused and concise at roughly 30-80 lines.
3. Prefer flowing narrative over a subheading for every paragraph.
4. Use real, specific examples from the supplied brain context when relevant.
5. Draw on existing projects and ideas from the knowledge context when relevant.
6. Do not add a generic "Key Takeaways" section or summary bullets at the end.
7. Avoid excessive subheading structure.

Follow the supplied style guide for voice, language, and positioning.`,
});
