import type { Logger, ProgressReporter } from "@brains/utils";
import {
  z,
  slugify,
  PROGRESS_STEPS,
  JobResult,
  generationResultSchema,
} from "@brains/utils";
import { BaseJobHandler, type ServicePluginContext } from "@brains/plugins";
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
export class ProjectGenerationJobHandler extends BaseJobHandler<
  "generation",
  ProjectGenerationJobData,
  ProjectGenerationResult
> {
  private readonly context: ServicePluginContext;

  constructor(logger: Logger, context: ServicePluginContext) {
    super(logger, {
      schema: projectGenerationJobSchema,
      jobTypeName: "project-generation",
    });
    this.context = context;
  }

  async process(
    data: ProjectGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<ProjectGenerationResult> {
    const { prompt, year } = data;
    let { title } = data;

    try {
      await progressReporter.report({
        progress: PROGRESS_STEPS.START,
        total: 100,
        message: "Starting project generation",
      });

      await progressReporter.report({
        progress: PROGRESS_STEPS.INIT,
        total: 100,
        message: "Generating project content with AI",
      });

      // Generate project content with AI
      const generated = await this.context.ai.generate<GeneratedProjectContent>(
        {
          prompt,
          templateName: "portfolio:generation",
        },
      );

      title = title ?? generated.title;

      await progressReporter.report({
        progress: PROGRESS_STEPS.GENERATE,
        total: 100,
        message: `Generated project: "${title}"`,
      });

      await progressReporter.report({
        progress: PROGRESS_STEPS.EXTRACT,
        total: 100,
        message: "Creating project entity",
      });

      // Create frontmatter
      const frontmatter = {
        title,
        slug: slugify(title),
        status: "draft" as const,
        description: generated.description,
        year,
      };

      // Create structured body content
      const bodyContent = {
        context: generated.context,
        problem: generated.problem,
        solution: generated.solution,
        outcome: generated.outcome,
      };

      // Generate markdown content
      const content = projectAdapter.createProjectContent(
        frontmatter,
        bodyContent,
      );

      await progressReporter.report({
        progress: PROGRESS_STEPS.SAVE,
        total: 100,
        message: "Saving project to database",
      });

      // Create entity
      const result = await this.context.entityService.createEntity({
        id: frontmatter.slug,
        entityType: "project",
        content,
        metadata: {
          title,
          slug: frontmatter.slug,
          status: "draft",
          year,
        },
      });

      await progressReporter.report({
        progress: PROGRESS_STEPS.COMPLETE,
        total: 100,
        message: `Project "${title}" created successfully`,
      });

      return {
        success: true,
        entityId: result.entityId,
        title,
      };
    } catch (error) {
      this.logger.error("Project generation job failed", {
        error,
        jobId,
        data,
      });

      return JobResult.failure(error);
    }
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
