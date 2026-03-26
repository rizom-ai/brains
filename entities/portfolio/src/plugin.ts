import type {
  Plugin,
  EntityPluginContext,
  JobHandler,
  Template,
  DataSource,
} from "@brains/plugins";
import {
  EntityPlugin,
  paginationInfoSchema,
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import {
  getErrorMessage,
  z,
  type PublishProvider,
  type PublishResult,
} from "@brains/utils";
import { createTemplate } from "@brains/templates";
import {
  projectSchema,
  enrichedProjectSchema,
  projectFrontmatterSchema,
  type Project,
} from "./schemas/project";
import { projectAdapter } from "./adapters/project-adapter";
import type { PortfolioConfig, PortfolioConfigInput } from "./config";
import { portfolioConfigSchema } from "./config";
import {
  ProjectListTemplate,
  type ProjectListProps,
} from "./templates/project-list";
import {
  ProjectDetailTemplate,
  type ProjectDetailProps,
} from "./templates/project-detail";
import { projectGenerationTemplate } from "./templates/generation-template";
import { ProjectGenerationJobHandler } from "./handlers/generation-handler";
import { ProjectDataSource } from "./datasources/project-datasource";
import packageJson from "../package.json";

const projectListSchema = z.object({
  projects: z.array(enrichedProjectSchema),
  pageTitle: z.string().optional(),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().optional(),
});

export class PortfolioPlugin extends EntityPlugin<Project, PortfolioConfig> {
  readonly entityType = projectAdapter.entityType;
  readonly schema = projectSchema;
  readonly adapter = projectAdapter;

  constructor(config: PortfolioConfigInput = {}) {
    super("portfolio", packageJson, config, portfolioConfigSchema);
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler | null {
    return new ProjectGenerationJobHandler(
      this.logger.child("ProjectGenerationJobHandler"),
      context,
    );
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      "project-list": createTemplate<
        z.infer<typeof projectListSchema>,
        ProjectListProps
      >({
        name: "project-list",
        description: "Portfolio project list page template",
        schema: projectListSchema,
        dataSourceId: "portfolio:entities",
        requiredPermission: "public",
        layout: { component: ProjectListTemplate },
      }),
      "project-detail": createTemplate<
        {
          project: z.infer<typeof enrichedProjectSchema>;
          prevProject: z.infer<typeof enrichedProjectSchema> | null;
          nextProject: z.infer<typeof enrichedProjectSchema> | null;
        },
        ProjectDetailProps
      >({
        name: "project-detail",
        description: "Individual project case study template",
        schema: z.object({
          project: enrichedProjectSchema,
          prevProject: enrichedProjectSchema.nullable(),
          nextProject: enrichedProjectSchema.nullable(),
        }),
        dataSourceId: "portfolio:entities",
        requiredPermission: "public",
        layout: { component: ProjectDetailTemplate },
      }),
      generation: projectGenerationTemplate,
    };
  }

  protected override getDataSources(): DataSource[] {
    return [new ProjectDataSource(this.logger.child("ProjectDataSource"))];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    this.registerEvalHandlers(context);
    await this.registerWithPublishPipeline(context);
    this.subscribeToPublishExecute(context);
  }

  private registerEvalHandlers(context: EntityPluginContext): void {
    context.eval.registerHandler("generateProject", async (input: unknown) => {
      const parsed = z
        .object({ prompt: z.string(), year: z.number() })
        .parse(input);
      return context.ai.generate<{
        title: string;
        description: string;
        context: string;
        problem: string;
        solution: string;
        outcome: string;
      }>({ prompt: parsed.prompt, templateName: "portfolio:generation" });
    });
  }

  private async registerWithPublishPipeline(
    context: EntityPluginContext,
  ): Promise<void> {
    const provider: PublishProvider = {
      name: "internal",
      publish: async (): Promise<PublishResult> => ({ id: "internal" }),
    };
    await context.messaging.send("publish:register", {
      entityType: "project",
      provider,
    });
  }

  private subscribeToPublishExecute(context: EntityPluginContext): void {
    context.messaging.subscribe<
      { entityType: string; entityId: string },
      { success: boolean }
    >("publish:execute", async (msg) => {
      const { entityType, entityId } = msg.payload;
      if (entityType !== "project") return { success: true };

      try {
        const project = await context.entityService.getEntity<Project>(
          "project",
          entityId,
        );
        if (!project) {
          await context.messaging.send("publish:report:failure", {
            entityType,
            entityId,
            error: `Project not found: ${entityId}`,
          });
          return { success: true };
        }
        if (project.metadata.status === "published") return { success: true };

        const parsed = parseMarkdownWithFrontmatter(
          project.content,
          projectFrontmatterSchema,
        );
        const publishedAt = new Date().toISOString();
        const updatedContent = generateMarkdownWithFrontmatter(parsed.content, {
          ...parsed.metadata,
          status: "published" as const,
          publishedAt,
        });

        await context.entityService.updateEntity({
          ...project,
          content: updatedContent,
          metadata: { ...project.metadata, status: "published", publishedAt },
        });

        await context.messaging.send("publish:report:success", {
          entityType,
          entityId,
          publishedAt,
        });
      } catch (error) {
        await context.messaging.send("publish:report:failure", {
          entityType,
          entityId,
          error: getErrorMessage(error),
        });
      }
      return { success: true };
    });
  }
}

export function portfolioPlugin(config: PortfolioConfigInput = {}): Plugin {
  return new PortfolioPlugin(config);
}
