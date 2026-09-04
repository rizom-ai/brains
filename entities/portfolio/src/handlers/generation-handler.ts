import type { EntityGenerationDeclaration } from "@brains/sdk/entities";
import { slugify } from "@brains/sdk/entities";
import { z } from "@brains/sdk/entities";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/sdk/entities";
import { projectAdapter } from "../adapters/project-adapter";

/**
 * Input schema for project generation job
 */
export interface ProjectGenerationJobData {
  prompt: string;
  year: number;
  title?: string | undefined;
}

export const projectGenerationJobSchema: z.ZodType<
  ProjectGenerationJobData,
  ProjectGenerationJobData
> = z.object({
  prompt: z.string(),
  year: z.number(),
  title: z.string().optional(),
});

export function buildProjectGenerationPrompt(
  data: ProjectGenerationJobData,
): string {
  return `Project request (authoritative):
${data.prompt}

Project year: ${data.year}

Use the project request as the primary source of truth. If retrieved knowledge context describes a different project or conflicts with this request, ignore that unrelated context.`;
}

/**
 * AI generation output schema.
 *
 * The schema is the definition; the type is read off it, so the two cannot
 * drift apart the way a hand-written interface beside a parse would.
 */
const generatedProjectContentSchema = z.object({
  title: z.string(),
  description: z.string(),
  context: z.string(),
  problem: z.string(),
  solution: z.string(),
  outcome: z.string(),
});

/**
 * Year is required on a project, so a create request that does not carry one
 * is refused here rather than falling through to ordinary creation — which
 * would build an entity whose metadata cannot validate.
 */
export function extractProjectYear(
  ...values: Array<string | undefined>
): number | null {
  for (const value of values) {
    const match = value?.match(/\b(19\d{2}|20\d{2})\b/u);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

const projectCreateInputSchema: z.ZodObject<{
  prompt: z.ZodOptional<z.ZodString>;
  title: z.ZodOptional<z.ZodString>;
  year: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  prompt: z.string().optional(),
  title: z.string().optional(),
  year: z.number().optional(),
});

/**
 * Project generation, declared.
 *
 * Create routing hands this the whole create request, so the year may arrive
 * spelled out in the prompt rather than as a field.
 */
export const projectGeneration: EntityGenerationDeclaration<
  typeof projectCreateInputSchema
> = {
  input: projectCreateInputSchema,
  generate: async ({ input, ai, entities, progress, template }) => {
    const prompt = input.prompt;
    if (!prompt) return { success: false, error: "A prompt is required" };

    const year = input.year ?? extractProjectYear(input.title, prompt);
    if (!year) {
      return {
        success: false,
        error:
          'A project needs a year. Include one in the prompt, for example "a 2024 project about …".',
      };
    }

    await progress.report({
      progress: 10,
      total: 100,
      message: "Generating project content with AI",
    });

    const voiceGuidance = formatVoiceGuidance(await fetchStyleGuide(entities));
    const generated = await ai.generate(
      {
        prompt: buildProjectGenerationPrompt({
          prompt,
          year,
          ...(input.title === undefined ? {} : { title: input.title }),
        }),
        templateName: template("generation"),
        representedIdentity: "anchor",
        ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
      },
      generatedProjectContentSchema,
    );

    const title = input.title ?? generated.title;
    const slug = slugify(title);

    await progress.report({
      progress: 50,
      total: 100,
      message: `Generated project: "${title}"`,
    });

    const content = projectAdapter.createProjectContent(
      {
        title,
        slug,
        status: "draft" as const,
        description: generated.description,
        year,
      },
      {
        context: generated.context,
        problem: generated.problem,
        solution: generated.solution,
        outcome: generated.outcome,
      },
    );

    await progress.report({
      progress: 100,
      total: 100,
      message: `Wrote project: "${title}"`,
    });
    // Content, not an entity: the runtime decides whether this fills in a
    // pre-allocated project or creates a new one.
    return {
      success: true,
      content,
      metadata: { title, slug, status: "draft", year },
      resultExtras: { title },
    };
  },
};
