import { generationResultSchema } from "@brains/contracts";
import type {
  EntityGenerationDeclaration,
  EntityGenerationResult,
} from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { projectBody } from "../lib/project-markdown";
import type { projectMetadataSchema } from "../schemas/project";

/**
 * Input schema for project generation job
 */
export const projectGenerationJobSchema: z.ZodObject<{
  prompt: z.ZodString;
  year: z.ZodNumber;
  title: z.ZodOptional<z.ZodString>;
}> = z.object({
  prompt: z.string(),
  year: z.number(),
  title: z.string().optional(),
});

export type ProjectGenerationJobData = z.output<
  typeof projectGenerationJobSchema
>;

export const projectGenerationResultSchema: ReturnType<
  typeof generationResultSchema.extend<{
    title: z.ZodOptional<z.ZodString>;
  }>
> = generationResultSchema.extend({
  title: z.string().optional(),
});

export type ProjectGenerationResult = z.output<
  typeof projectGenerationResultSchema
>;

export function buildProjectGenerationPrompt(
  data: ProjectGenerationJobData,
): string {
  return `Project request (authoritative):
${data.prompt}

Project year: ${data.year}

Use the project request as the primary source of truth. If retrieved knowledge context describes a different project or conflicts with this request, ignore that unrelated context.`;
}

/**
 * AI generation output schema
 */
export const generatedProjectContentSchema: z.ZodObject<{
  title: z.ZodString;
  description: z.ZodString;
  context: z.ZodString;
  problem: z.ZodString;
  solution: z.ZodString;
  outcome: z.ZodString;
}> = z.object({
  title: z.string(),
  description: z.string(),
  context: z.string(),
  problem: z.string(),
  solution: z.string(),
  outcome: z.string(),
});

/**
 * The project's `project:generation`: a case study written from a request
 * and the year it began, as the anchor and in the brain's voice, saved as
 * a draft under its title's slug.
 */
export const projectGeneration: EntityGenerationDeclaration<
  typeof projectGenerationJobSchema,
  typeof projectMetadataSchema
> = {
  input: projectGenerationJobSchema,
  generate: async ({
    input,
    ai,
    progress,
  }): Promise<EntityGenerationResult<typeof projectMetadataSchema>> => {
    await progress.report({
      progress: 10,
      message: "Generating project content with AI",
    });
    const generated = await ai.generate(
      {
        template: "generation",
        prompt: buildProjectGenerationPrompt(input),
        representedIdentity: "anchor",
        voice: true,
      },
      generatedProjectContentSchema,
    );
    const title = input.title ?? generated.title;
    const slug = slugify(title);
    await progress.report({
      progress: 50,
      message: `Generated project: "${title}"`,
    });
    return {
      success: true,
      id: slug,
      content: projectBody({
        context: generated.context,
        problem: generated.problem,
        solution: generated.solution,
        outcome: generated.outcome,
      }),
      metadata: {
        title,
        slug,
        authoredSlug: true,
        status: "draft" as const,
        description: generated.description,
        year: input.year,
      },
      resultExtras: { title },
    };
  },
};
