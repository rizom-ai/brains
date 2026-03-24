import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated project content
 */
export const projectGenerationSchema = z.object({
  title: z
    .string()
    .max(80)
    .describe(
      "A clear, compelling project title (3-8 words). Should capture the essence of the project.",
    ),
  description: z
    .string()
    .describe(
      "A 1-2 sentence summary of the project for portfolio cards. Focus on the core value delivered.",
    ),
  context: z
    .string()
    .describe(
      "Background information: Who was the client/user? What was the situation? What constraints existed? (2-4 paragraphs)",
    ),
  problem: z
    .string()
    .describe(
      "The challenge: What specific problem needed solving? What were the pain points? (2-3 paragraphs)",
    ),
  solution: z
    .string()
    .describe(
      "The approach: What was built? What technologies/methods were used? How did it work? (3-5 paragraphs)",
    ),
  outcome: z
    .string()
    .describe(
      "The results: What impact did this have? What metrics improved? What was learned? (2-3 paragraphs)",
    ),
});

export type ProjectGeneration = z.infer<typeof projectGenerationSchema>;

/**
 * Template for AI-powered project case study generation
 */
export const projectGenerationTemplate = createTemplate<ProjectGeneration>({
  name: "portfolio:generation",
  description: "Template for AI to generate portfolio project case studies",
  schema: projectGenerationSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  basePrompt: `You are helping to create a professional portfolio case study based on REAL project information.

IMPORTANT: The prompt contains related content found in the user's knowledge base. Use this content as the source of truth - extract facts, technologies, challenges, and outcomes from it. Do NOT invent or fabricate details.

Your task is to structure the provided information into a compelling case study narrative.

Guidelines:
1. Title: Clear and professional (3-8 words). Derive from the project topic.
2. Description: Concise summary for preview cards. Based on actual project outcomes.
3. Context: Set the scene using information from the provided content. Who built it? What was the situation?
4. Problem: Extract the challenges from the provided content. What needed solving?
5. Solution: Describe what was built based on the provided content. Include actual technologies mentioned.
6. Outcome: Use any results, metrics, or lessons mentioned in the provided content.

CRITICAL: Only include information that can be derived from the provided content. If information is missing, keep that section brief rather than inventing details.

Tone: Professional but accessible. Write for someone evaluating real work.
Structure: Use markdown formatting. Break long sections into paragraphs for readability.`,
});
