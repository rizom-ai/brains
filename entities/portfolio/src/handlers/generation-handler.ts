import { BaseGenerationJobHandler } from "@brains/plugins";
import type {
  GeneratedContent,
  EntityGenerationDeclaration,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { generationResultSchema } from "@brains/contracts";
import type { EntityPluginContext } from "@brains/plugins";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/contracts";
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

export interface ProjectGenerationResult extends z.output<
  typeof generationResultSchema
> {
  title?: string | undefined;
}

export const projectGenerationResultSchema: ReturnType<
  typeof generationResultSchema.extend<{
    title: z.ZodOptional<z.ZodString>;
  }>
> = generationResultSchema.extend({
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
 * AI generation output schema
 */
interface GeneratedProjectContent {
  title: string;
  description: string;
  context: string;
  problem: string;
  solution: string;
  outcome: string;
}

/**
 * Job handler for portfolio project generation
 * Handles AI-powered content generation and entity creation
 */
export class ProjectGenerationJobHandler extends BaseGenerationJobHandler<
  ProjectGenerationJobData,
  ProjectGenerationResult
> {
  constructor(logger: Logger, context: EntityPluginContext) {
    super(logger, context, {
      schema: projectGenerationJobSchema,
      jobTypeName: "project-generation",
      entityType: "project",
    });
  }

  protected async generate(
    data: ProjectGenerationJobData,
    progressReporter: ProgressReporter,
  ): Promise<GeneratedContent> {
    const { year } = data;

    await this.reportProgress(progressReporter, {
      progress: 10,
      message: "Generating project content with AI",
    });

    const voiceGuidance = formatVoiceGuidance(
      await fetchStyleGuide(this.context.entityService),
    );
    const generated = await this.context.ai.generate<GeneratedProjectContent>({
      prompt: buildProjectGenerationPrompt(data),
      templateName: "portfolio:generation",
      representedIdentity: "anchor",
      ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
    });

    const title = data.title ?? generated.title;
    const slug = slugify(title);

    await this.reportProgress(progressReporter, {
      progress: 50,
      message: `Generated project: "${title}"`,
    });

    const frontmatter = {
      title,
      slug,
      status: "draft" as const,
      description: generated.description,
      year,
    };

    const bodyContent = {
      context: generated.context,
      problem: generated.problem,
      solution: generated.solution,
      outcome: generated.outcome,
    };

    return {
      id: slug,
      content: projectAdapter.createProjectContent(frontmatter, bodyContent),
      metadata: { title, slug, status: "draft", year },
      title,
      resultExtras: { title },
    };
  }

  protected override summarizeDataForLog(
    data: ProjectGenerationJobData,
  ): Record<string, unknown> {
    return {
      prompt: data.prompt.substring(0, 100),
      year: data.year,
      title: data.title,
    };
  }
}

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
  handle: async ({ input, ai, entities, progress }) => {
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
    const generated = await ai.generate<GeneratedProjectContent>({
      prompt: buildProjectGenerationPrompt({
        prompt,
        year,
        ...(input.title === undefined ? {} : { title: input.title }),
      }),
      templateName: "portfolio:generation",
      representedIdentity: "anchor",
      ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
    });

    const title = input.title ?? generated.title;
    const slug = slugify(title);

    await progress.report({
      progress: 50,
      total: 100,
      message: `Generated project: "${title}"`,
    });

    const result = await entities.create({
      id: slug,
      entityType: "project",
      content: projectAdapter.createProjectContent(
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
      ),
      metadata: { title, slug, status: "draft", year },
    });

    await progress.report({
      progress: 100,
      total: 100,
      message: `Saved project: "${title}"`,
    });
    return { success: true, entityId: result.entityId, title };
  },
};
