import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
  Command,
  CommandResponse,
  JobContext,
  Template,
  SectionDefinition,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { siteContentPreviewSchema, siteContentProductionSchema } from "./types";
import { SiteBuilder } from "./lib/site-builder";
import { SiteContentService } from "./lib/site-content-service";
import {
  siteContentPreviewAdapter,
  siteContentProductionAdapter,
} from "./entities/site-content-adapter";
import { ContentManager } from "@brains/plugins";
import { dashboardTemplate } from "./templates/dashboard";
import { DashboardFormatter } from "./templates/dashboard/formatter";
import { SiteBuildJobHandler } from "./handlers/siteBuildJobHandler";
import { createSiteBuilderTools } from "./tools";
import type { SiteBuilderConfig, SiteBuilderConfigInput } from "./config";
import {
  siteBuilderConfigSchema,
  SITE_BUILDER_CONFIG_DEFAULTS,
} from "./config";
import packageJson from "../package.json";

/**
 * Site Builder Plugin
 * Provides static site generation capabilities
 */
export class SiteBuilderPlugin extends ServicePlugin<SiteBuilderConfig> {
  private siteBuilder?: SiteBuilder;
  private siteContentService?: SiteContentService;
  private contentManager?: ContentManager;
  private pluginContext?: ServicePluginContext;

  constructor(config: SiteBuilderConfigInput = {}) {
    super(
      "site-builder",
      packageJson,
      config,
      siteBuilderConfigSchema,
      SITE_BUILDER_CONFIG_DEFAULTS,
    );
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    // Register site content entity types
    context.registerEntityType(
      "site-content-preview",
      siteContentPreviewSchema,
      siteContentPreviewAdapter,
    );
    this.logger.debug("Registered site-content-preview entity type");

    context.registerEntityType(
      "site-content-production",
      siteContentProductionSchema,
      siteContentProductionAdapter,
    );
    this.logger.debug("Registered site-content-production entity type");

    // Register built-in dashboard template using unified method
    context.registerTemplates({ dashboard: dashboardTemplate });
    this.logger.debug("Registered dashboard template");

    // Register dashboard route
    const dashboardFormatter = new DashboardFormatter();
    context.registerRoutes(
      [
        {
          id: "dashboard",
          path: "/dashboard",
          title: "System Dashboard",
          description: "Monitor your Brain system statistics and activity",
          sections: [
            {
              id: "main",
              template: "dashboard", // Plugin prefix is added automatically
              content: dashboardFormatter.getMockData(), // Temporary: provide mock data directly
            },
          ],
        },
      ],
      {
        environment: this.config.environment ?? "preview",
      },
    );
    this.logger.debug("Registered dashboard route");

    // Register templates from configuration using unified registration
    if (this.config.templates) {
      context.registerTemplates(
        this.config.templates as Record<string, Template>,
      );
      this.logger.debug(
        `Registered ${Object.keys(this.config.templates).length} templates from config`,
      );
    }

    // Register routes if provided
    if (this.config.routes) {
      context.registerRoutes(this.config.routes, {
        environment: this.config.environment ?? "preview",
      });
    }

    // Initialize the site builder with plugin context
    this.siteBuilder = SiteBuilder.getInstance(
      context.logger.child("SiteBuilder"),
      context,
    );

    // Initialize the site content service
    this.siteContentService = new SiteContentService(
      this.logger.child("SiteContentService"),
      context,
      this.id,
      this.config.siteConfig,
    );

    // Initialize the shared content manager
    this.contentManager = new ContentManager(
      context.entityService,
      this.logger.child("ContentManager"),
      context,
    );

    // Register job handler for site builds
    const siteBuildHandler = new SiteBuildJobHandler(
      this.logger.child("SiteBuildJobHandler"),
      context,
    );
    context.registerJobHandler("site-build", siteBuildHandler);
    this.logger.debug("Registered site-build job handler");

    // Site builder is now encapsulated within the plugin
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }

    return createSiteBuilderTools(
      () => this.siteBuilder,
      () => this.siteContentService,
      this.pluginContext,
      this.id,
    );
  }

  /**
   * Expose site-builder commands for message interfaces
   */
  public override async getCommands(): Promise<Command[]> {
    return [
      {
        name: "generate",
        description:
          "Generate content for all routes, a specific route, or a specific section",
        usage: "/generate [routeId] [sectionId] [--force] [--dry-run]",
        handler: async (args, context): Promise<CommandResponse> => {
          // Parse command arguments
          const dryRun = args.includes("--dry-run");
          const force = args.includes("--force");
          const filteredArgs = args.filter((arg) => !arg.startsWith("--"));
          const routeId = filteredArgs[0];
          const sectionId = filteredArgs[1];

          // Validate that sectionId is only used with routeId
          if (sectionId && !routeId) {
            return {
              type: "message",
              message: "❌ sectionId requires routeId to be specified",
            };
          }

          if (!this.contentManager || !this.context) {
            return {
              type: "message",
              message:
                "❌ Content manager not initialized. Please ensure the plugin is properly registered.",
            };
          }

          try {
            // Get routes and template resolver
            const routes = this.context.listRoutes();
            const templateResolver = (section: SectionDefinition): string => {
              if (!this.context) {
                throw new Error("Plugin context not initialized");
              }
              const viewTemplate = this.context.getViewTemplate(
                section.template,
              );
              if (!viewTemplate) {
                throw new Error(`Template not found: ${section.template}`);
              }
              return viewTemplate.name;
            };

            // Create metadata for job context
            const metadata: JobContext = {
              interfaceId: context.interfaceType || "command",
              userId: context.userId || "command-user",
              channelId: context.channelId,
              progressToken: "", // CommandContext doesn't have messageId
              pluginId: this.id,
              operationType: "content_generation",
            };

            // Use the content manager to generate content
            const result = await this.contentManager.generate(
              { routeId, sectionId, force, dryRun },
              routes,
              templateResolver,
              "site-content-preview",
              { source: "command:generate", metadata },
              this.config.siteConfig,
            );

            if (dryRun) {
              const scope = routeId
                ? sectionId
                  ? `section ${routeId}:${sectionId}`
                  : `route ${routeId}`
                : "all routes";
              return {
                type: "message",
                message: `🔍 **Dry run completed** - No content was actually generated for ${scope}. Use \`/generate\` without --dry-run to execute.`,
              };
            }

            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "batch-operation",
              message: `🚀 **Content generation started** - Generated ${result.queuedSections} of ${result.totalSections} sections for ${scope}. ${result.queuedSections > 0 ? "Jobs are running in the background." : "No new content to generate."}`,
              batchId: result.batchId,
              operationCount: result.queuedSections,
            };
          } catch (error) {
            this.error("Generate command failed", error);
            return {
              type: "message",
              message: `❌ **Generation failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
            };
          }
        },
      },
      {
        name: "promote",
        description:
          "Promote all preview content, a specific route, or a specific section to production",
        usage: "/promote [routeId] [sectionId] [--dry-run]",
        handler: async (args, context): Promise<CommandResponse> => {
          // Parse command arguments
          const dryRun = args.includes("--dry-run");
          const filteredArgs = args.filter((arg) => !arg.startsWith("--"));
          const routeId = filteredArgs[0];
          const sectionId = filteredArgs[1];

          // Validate that sectionId is only used with routeId
          if (sectionId && !routeId) {
            return {
              type: "message",
              message: "❌ sectionId requires routeId to be specified",
            };
          }

          if (!this.contentManager) {
            return {
              type: "message",
              message:
                "❌ Content manager not initialized. Please ensure the plugin is properly registered.",
            };
          }

          try {
            // Get filtered preview entities
            const previewEntities =
              await this.contentManager.getPreviewEntities({
                ...(routeId && { routeId }),
              });

            let entityIds: string[];
            if (sectionId) {
              // Filter by section
              entityIds = previewEntities
                .filter((e) => e.sectionId === sectionId)
                .map((e) => e.id);
            } else {
              entityIds = previewEntities.map((e) => e.id);
            }

            if (entityIds.length === 0) {
              const scope = routeId
                ? sectionId
                  ? `section ${routeId}:${sectionId}`
                  : `route ${routeId}`
                : "all routes";
              return {
                type: "message",
                message: `ℹ️ No preview content found to promote for ${scope}.`,
              };
            }

            if (dryRun) {
              const scope = routeId
                ? sectionId
                  ? `section ${routeId}:${sectionId}`
                  : `route ${routeId}`
                : "all routes";
              return {
                type: "message",
                message: `🔍 **Dry run** - Would promote ${entityIds.length} preview entities to production for ${scope}. Use \`/promote\` without --dry-run to execute.`,
              };
            }

            const metadata: JobContext = {
              interfaceId: context.interfaceType || "command",
              userId: context.userId || "command-user",
              channelId: context.channelId,
              progressToken: "", // CommandContext doesn't have messageId
              pluginId: this.id,
              operationType: "site_building",
            };

            const batchId = await this.contentManager.promote(entityIds, {
              source: "command:promote",
              metadata,
            });

            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "batch-operation",
              message: `📤 **Promotion started** - Promoting ${entityIds.length} preview entities to production for ${scope}...`,
              batchId,
              operationCount: entityIds.length,
            };
          } catch (error) {
            this.error("Promote command failed", error);
            return {
              type: "message",
              message: `❌ **Promotion failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
            };
          }
        },
      },
      {
        name: "rollback",
        description:
          "Rollback all production content, a specific route, or a specific section",
        usage: "/rollback [routeId] [sectionId] [--dry-run]",
        handler: async (args, context): Promise<CommandResponse> => {
          // Parse command arguments
          const dryRun = args.includes("--dry-run");
          const filteredArgs = args.filter((arg) => !arg.startsWith("--"));
          const routeId = filteredArgs[0];
          const sectionId = filteredArgs[1];

          // Validate that sectionId is only used with routeId
          if (sectionId && !routeId) {
            return {
              type: "message",
              message: "❌ sectionId requires routeId to be specified",
            };
          }

          if (!this.contentManager) {
            return {
              type: "message",
              message:
                "❌ Content manager not initialized. Please ensure the plugin is properly registered.",
            };
          }

          try {
            // Get filtered production entities
            const productionEntities =
              await this.contentManager.getProductionEntities({
                ...(routeId && { routeId }),
              });

            let entityIds: string[];
            if (sectionId) {
              // Filter by section
              entityIds = productionEntities
                .filter((e) => e.sectionId === sectionId)
                .map((e) => e.id);
            } else {
              entityIds = productionEntities.map((e) => e.id);
            }

            if (entityIds.length === 0) {
              const scope = routeId
                ? sectionId
                  ? `section ${routeId}:${sectionId}`
                  : `route ${routeId}`
                : "all routes";
              return {
                type: "message",
                message: `ℹ️ No production content found to rollback for ${scope}.`,
              };
            }

            if (dryRun) {
              const scope = routeId
                ? sectionId
                  ? `section ${routeId}:${sectionId}`
                  : `route ${routeId}`
                : "all routes";
              return {
                type: "message",
                message: `🔍 **Dry run** - Would rollback ${entityIds.length} production entities for ${scope}. Use \`/rollback\` without --dry-run to execute.`,
              };
            }

            const metadata: JobContext = {
              interfaceId: context.interfaceType || "command",
              userId: context.userId || "command-user",
              channelId: context.channelId,
              progressToken: "", // CommandContext doesn't have messageId
              pluginId: this.id,
              operationType: "site_building",
            };

            const batchId = await this.contentManager.rollback(entityIds, {
              source: "command:rollback",
              metadata,
            });

            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "batch-operation",
              message: `↩️ **Rollback started** - Rolling back ${entityIds.length} production entities for ${scope}...`,
              batchId,
              operationCount: entityIds.length,
            };
          } catch (error) {
            this.error("Rollback command failed", error);
            return {
              type: "message",
              message: `❌ **Rollback failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
            };
          }
        },
      },
      {
        name: "build-site",
        description: "Build static site from existing content",
        usage: "/build-site [preview|production]",
        handler: async (args, context): Promise<CommandResponse> => {
          // Parse environment from args (default to preview)
          const environment = (
            args[0] === "production" ? "production" : "preview"
          ) as "preview" | "production";

          if (!this.pluginContext) {
            return {
              type: "message",
              message:
                "❌ Site builder not initialized. Please ensure the plugin is properly registered.",
            };
          }

          try {
            // Build site directly (same logic as build-site tool)
            const config = this.config;

            // Choose output directory based on environment
            const outputDir =
              environment === "production"
                ? config.productionOutputDir
                : config.previewOutputDir;

            const jobData = {
              environment,
              outputDir,
              workingDir: config.workingDir,
              enableContentGeneration: false,
              siteConfig: config.siteConfig ?? {
                title: "Personal Brain",
                description: "A knowledge management system",
              },
            };

            const metadata: JobContext = {
              interfaceId: context.interfaceType || "command",
              userId: context.userId || "command-user",
              channelId: context.channelId,
              progressToken: "", // CommandContext doesn't have messageId
              pluginId: this.id,
              operationType: "site_building",
            };

            // Queue the job for async processing
            const jobId = await this.pluginContext.enqueueJob(
              "site-build",
              jobData,
              {
                priority: 5,
                source: "command:build-site",
                metadata,
              },
            );

            return {
              type: "job-operation",
              message: `🔨 **Site build started** - Building ${environment} site to \`${outputDir}\`...`,
              jobId,
            };
          } catch (error) {
            this.error("Build-site command failed", error);
            return {
              type: "message",
              message: `❌ **Build failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
            };
          }
        },
      },
    ];
  }

  /**
   * No resources needed for this plugin
   */
  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }

  /**
   * Get the site builder instance
   */
  public getSiteBuilder(): SiteBuilder | undefined {
    return this.siteBuilder;
  }

  /**
   * Get the site content service instance
   */
  public getSiteContentService(): SiteContentService | undefined {
    return this.siteContentService;
  }
}

/**
 * Factory function to create the plugin
 */
export function siteBuilderPlugin(config?: SiteBuilderConfigInput): Plugin {
  return new SiteBuilderPlugin(config);
}
