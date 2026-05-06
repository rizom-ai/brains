import { BaseGenerationJobHandler } from "@brains/plugins";
import type { GeneratedContent } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z, slugify, generationResultSchema } from "@brains/utils";
import type { EntityPluginContext } from "@brains/plugins";
import { projectAdapter } from "../adapters/project-adapter";

/**
 * Input schema for project generation job
 */
export const projectGenerationJobSchema = z.object({
  prompt: z.string(),
  year: z.number(),
  title: z.string().optional(),
});

export type ProjectGenerationJobData = z.infer<
  typeof projectGenerationJobSchema
>;

export const projectGenerationResultSchema = generationResultSchema.extend({
  title: z.string().optional(),
});

export type ProjectGenerationResult = z.infer<
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

    const generated = await this.context.ai.generate<GeneratedProjectContent>({
      prompt: buildProjectGenerationPrompt(data),
      templateName: "portfolio:generation",
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
