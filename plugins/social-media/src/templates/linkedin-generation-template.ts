import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated LinkedIn post
 */
export const linkedinPostGenerationSchema = z.object({
  content: z
    .string()
    .describe(
      "The LinkedIn post content. Professional, engaging, and optimized for the LinkedIn algorithm.",
    ),
});

export type LinkedInPostGeneration = z.infer<
  typeof linkedinPostGenerationSchema
>;

/**
 * Template for AI-powered LinkedIn post generation from prompts
 */
export const linkedinGenerationTemplate =
  createTemplate<LinkedInPostGeneration>({
    name: "social-media:generation-linkedin",
    description: "Template for AI to generate LinkedIn posts from prompts",
    schema: linkedinPostGenerationSchema,
    dataSourceId: "shell:ai-content",
    requiredPermission: "public",
    basePrompt: `You are writing LinkedIn posts that drive engagement and build professional credibility.

Your task is to generate a LinkedIn post based on the user's prompt.

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
