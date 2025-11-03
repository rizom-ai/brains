import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated blog post
 */
export const blogGenerationSchema = z.object({
  title: z.string().describe("A compelling, SEO-friendly blog post title"),
  content: z
    .string()
    .describe(
      "Full blog post content in markdown format with proper headers, paragraphs, lists, code blocks, etc.",
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
  basePrompt: `You are an expert technical writer creating high-quality blog posts.

Your task is to generate a complete blog post based on the user's prompt.

Guidelines:
1. Title: Create a compelling, clear title that accurately reflects the content
2. Content: Write well-structured markdown with:
   - Clear hierarchy using headers (##, ###)
   - Engaging introduction that hooks the reader
   - Well-organized sections with subheadings
   - Code examples where relevant (using \`\`\` blocks)
   - Concrete examples and explanations
   - Practical takeaways or conclusions
3. Excerpt: Write a concise 1-2 sentence summary that would work as a meta description

The content should be informative, well-researched, and engaging. Use a professional yet approachable tone.`,
});
