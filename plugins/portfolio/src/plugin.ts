import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import {
  ServicePlugin,
  paginationInfoSchema,
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z, type PublishProvider, type PublishResult } from "@brains/utils";
import { createTemplate } from "@brains/templates";
import {
  projectSchema,
  enrichedProjectSchema,
  projectFrontmatterSchema,
  type Project,
} from "./schemas/project";
import { projectAdapter } from "./adapters/project-adapter";
import { createPortfolioTools } from "./tools";
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

/**
 * Portfolio Plugin
 * Provides portfolio project management with AI-powered case study generation
 */
export class PortfolioPlugin extends ServicePlugin<PortfolioConfig> {
  private pluginContext?: ServicePluginContext;

  constructor(config: PortfolioConfigInput) {
    super("portfolio", packageJson, config, portfolioConfigSchema);
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    // Register project entity type
    context.entities.register("project", projectSchema, projectAdapter);

    // Register project datasource
    const projectDataSource = new ProjectDataSource(
      context.entityService,
      this.logger.child("ProjectDataSource"),
    );
    context.entities.registerDataSource(projectDataSource);

    // Register portfolio templates
    // Datasource transforms Project → ProjectWithData (adds parsed frontmatter)
    // Schema validates with optional url/typeLabel, site-builder enriches before rendering

    // Define schema for project list template (with pagination support)
    const projectListSchema = z.object({
      projects: z.array(enrichedProjectSchema),
      pageTitle: z.string().optional(),
      pagination: paginationInfoSchema.nullable(),
      baseUrl: z.string().optional(),
    });

    context.templates.register({
      "project-list": createTemplate<
        z.infer<typeof projectListSchema>,
        ProjectListProps
      >({
        name: "project-list",
        description: "Portfolio project list page template",
        schema: projectListSchema,
        dataSourceId: "portfolio:entities",
        requiredPermission: "public",
        layout: {
          component: ProjectListTemplate,
          interactive: false,
        },
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
        layout: {
          component: ProjectDetailTemplate,
          interactive: false,
        },
      }),
      generation: projectGenerationTemplate,
    });

    // Register job handler for project generation
    const projectGenerationHandler = new ProjectGenerationJobHandler(
      this.logger.child("ProjectGenerationJobHandler"),
      context,
    );
    context.jobs.registerHandler("generation", projectGenerationHandler);

    // Register eval handlers for AI testing
    this.registerEvalHandlers(context);

    // Register with publish-pipeline for both direct and queued publishing
    await this.registerWithPublishPipeline(context);
    this.subscribeToPublishExecute(context);

    this.logger.info(
      "Portfolio plugin registered successfully (routes auto-generated at /projects/)",
    );
  }

  /**
   * Register eval handlers for plugin testing
   */
  private registerEvalHandlers(context: ServicePluginContext): void {
    // Generate project case study from prompt
    const generateProjectInputSchema = z.object({
      prompt: z.string(),
      year: z.number(),
    });

    context.eval.registerHandler("generateProject", async (input: unknown) => {
      const parsed = generateProjectInputSchema.parse(input);

      return context.ai.generate<{
        title: string;
        description: string;
        context: string;
        problem: string;
        solution: string;
        outcome: string;
      }>({
        prompt: parsed.prompt,
        templateName: "portfolio:generation",
      });
    });
  }

  /**
   * Register with publish-pipeline using internal provider
   */
  private async registerWithPublishPipeline(
    context: ServicePluginContext,
  ): Promise<void> {
    const internalProvider: PublishProvider = {
      name: "internal",
      publish: async (): Promise<PublishResult> => {
        return { id: "internal" };
      },
    };

    await context.messaging.send("publish:register", {
      entityType: "project",
      provider: internalProvider,
    });
  }

  /**
   * Subscribe to publish:execute messages for project entities
   */
  private subscribeToPublishExecute(context: ServicePluginContext): void {
    context.messaging.subscribe<
      { entityType: string; entityId: string },
      { success: boolean }
    >("publish:execute", async (msg) => {
      const { entityType, entityId } = msg.payload;

      // Only handle project entities
      if (entityType !== "project") {
        return { success: true };
      }

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

        // Skip already published projects
        if (project.metadata.status === "published") {
          return { success: true };
        }

        // Parse existing content and update frontmatter
        const parsed = parseMarkdownWithFrontmatter(
          project.content,
          projectFrontmatterSchema,
        );

        const publishedAt = new Date().toISOString();
        const updatedFrontmatter = {
          ...parsed.metadata,
          status: "published" as const,
          publishedAt,
        };

        const updatedContent = generateMarkdownWithFrontmatter(
          parsed.content,
          updatedFrontmatter,
        );

        // Update entity
        await context.entityService.updateEntity({
          ...project,
          content: updatedContent,
          metadata: {
            ...project.metadata,
            status: "published",
            publishedAt,
          },
        });

        // Report success
        await context.messaging.send("publish:report:success", {
          entityType,
          entityId,
          publishedAt,
        });

        this.logger.info(`Published project: ${entityId}`);
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await context.messaging.send("publish:report:failure", {
          entityType,
          entityId,
          error: errorMessage,
        });
        this.logger.error(`Failed to publish project ${entityId}:`, {
          error: errorMessage,
        });
        return { success: true };
      }
    });
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }

    return createPortfolioTools(this.id, this.pluginContext);
  }

  /**
   * No resources needed for this plugin
   */
  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }
}

/**
 * Factory function to create the plugin
 */
export function portfolioPlugin(config: PortfolioConfigInput): Plugin {
  return new PortfolioPlugin(config);
}
