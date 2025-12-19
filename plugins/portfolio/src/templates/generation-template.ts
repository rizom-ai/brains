import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated project content
 */
export const projectGenerationSchema = z.object({
  title: z
    .string()
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
  basePrompt: `You are helping to create a professional portfolio case study that showcases work in a compelling way.

Your task is to generate a structured project case study based on the user's prompt. The case study should follow a classic problem-solution-results narrative structure.

Guidelines:
1. Title: Clear and professional (3-8 words). Should capture the project's essence without jargon.
2. Description: Concise summary for preview cards. Focus on the value delivered, not the technology.
3. Context: Set the scene. Who was the client? What was their situation? Any important constraints?
4. Problem: Clearly articulate the challenge. What needed to change? What were the stakes?
5. Solution: Describe what was built and how. Include key technical decisions and their rationale.
6. Outcome: Quantify impact where possible. Include lessons learned and broader implications.

Tone: Professional but accessible. Avoid excessive jargon. Write for someone evaluating your work.
Structure: Use markdown formatting. Break long sections into paragraphs for readability.
No meta-commentary: Provide content directly without phrases like "This project..." or "In this case study..."`,
});
