import { z } from "@brains/utils/zod";
import { createTemplate, type Template } from "@brains/plugins";

/** What the brain derives for a project saved from the writer's own text. */
export const projectFromTextSchema: z.ZodObject<{
  description: z.ZodString;
  year: z.ZodNullable<z.ZodNumber>;
}> = z.object({
  description: z
    .string()
    .describe(
      "A 1-2 sentence summary of the project for portfolio cards, drawn only from the text. Focus on the core value delivered.",
    ),
  year: z
    .number()
    .int()
    .nullable()
    .describe(
      "The year the project began, only when the text states it; null when it does not. Never guess.",
    ),
});

export type ProjectFromText = z.output<typeof projectFromTextSchema>;

/** Template for deriving a project's card description and start year from its own text. */
export const projectFromTextTemplate: Template =
  createTemplate<ProjectFromText>({
    name: "portfolio:from-text",
    description:
      "Derive a portfolio project's card description and start year from the writer's own case study text",
    schema: projectFromTextSchema,
    dataSourceId: "shell:ai-content",
    requiredPermission: "public",
    basePrompt: `You are given a portfolio project the writer wrote themselves. Do not rewrite it.

1. Write a short description (1-2 sentences) for the project's card, using only what the text says.
2. Give the year the project began if the text states it, otherwise null. Do not infer a year from context or guess.

Follow the supplied style guide for voice, tone, wording and form.`,
  });
