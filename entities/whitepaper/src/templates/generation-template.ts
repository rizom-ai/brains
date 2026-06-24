import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

export const whitepaperGenerationSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("A clear, strategic white paper title. Must not be empty."),
  subtitle: z
    .string()
    .trim()
    .max(180)
    .describe(
      "A concise subtitle that clarifies the paper's scope, or an empty string if none is needed.",
    ),
  thesis: z
    .string()
    .trim()
    .min(1)
    .describe("The central thesis or argument of the white paper."),
  abstract: z
    .string()
    .trim()
    .min(1)
    .describe("A short executive abstract summarizing the argument and value."),
  keywords: z
    .array(z.string().trim().min(1))
    .max(8)
    .describe(
      "Topical keywords for discovery. Return an empty array if none apply.",
    ),
  body: z
    .string()
    .trim()
    .min(1)
    .describe("A markdown outline using section headings and concise bullets."),
});

export type WhitepaperGeneration = z.infer<typeof whitepaperGenerationSchema>;

export const whitepaperGenerationTemplate =
  createTemplate<WhitepaperGeneration>({
    name: "whitepaper:generation",
    description: "Template for generating structured white paper outlines",
    schema: whitepaperGenerationSchema,
    dataSourceId: "shell:ai-content",
    requiredPermission: "public",
    useKnowledgeContext: true,
    basePrompt: `You are helping create strategic long-form white papers.

Your task is to generate a structured white paper outline from the user's prompt. Generate an outline, not a complete prose draft.

Always return non-empty values for title, thesis, abstract, and body.

Guidelines:
1. Status: Treat this as an outline-stage white paper.
2. Title: Clear, specific, and strategic. Avoid vague marketing slogans.
3. Thesis: State the central argument in one strong sentence.
4. Abstract: Summarize the problem, argument, and intended value in 2-4 sentences.
5. Body: Markdown outline with useful section headings and concise bullets under each heading.
6. Use second-level markdown headings (##) for every top-level body section. Do not use first-level # headings in the body.
7. Default structure: ## Executive Summary; ## Problem / Context; ## Core Thesis; ## Conceptual Framework; ## Design Principles; ## Technology / Stack; ## Use Cases; ## Governance / Risks; ## Implementation Roadmap; ## Conclusion.
8. Do not include YAML frontmatter in the body. The system will create frontmatter separately.
9. Do not pretend to cite or quote source entities unless the prompt provides specific source material.
10. Keep the output practical enough to expand into a full draft later.`,
  });
