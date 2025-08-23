import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
  Command,
  CommandResponse,
  JobContext,
  Template,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { siteContentPreviewSchema, siteContentProductionSchema } from "./types";
import { SiteBuilder } from "./lib/site-builder";
import { SiteContentService } from "./lib/site-content-service";
import {
  siteContentPreviewAdapter,
  siteContentProductionAdapter,
} from "./entities/site-content-adapter";
import { dashboardTemplate } from "./templates/dashboard";
import { DashboardFormatter } from "./templates/dashboard/formatter";
import { SiteBuildJobHandler } from "./handlers/siteBuildJobHandler";
import { SiteContentDerivationJobHandler } from "./handlers/site-content-derivation-handler";
import { SiteContentGenerationJobHandler } from "./handlers/site-content-generation-handler";
import { createSiteBuilderTools } from "./tools";
import type { SiteBuilderConfig } from "./config";
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
  private pluginContext?: ServicePluginContext;

  constructor(config: Partial<SiteBuilderConfig> = {}) {
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
      context,
      this.config.siteConfig,
    );

    // Register job handlers
    const siteBuildHandler = new SiteBuildJobHandler(
      this.logger.child("SiteBuildJobHandler"),
      context,
    );
    context.registerJobHandler("site-build", siteBuildHandler);
    this.logger.debug("Registered site-build job handler");

    const siteContentDerivationHandler = new SiteContentDerivationJobHandler(
      context,
    );
    context.registerJobHandler(
      "content-derivation",
      siteContentDerivationHandler,
    );
    this.logger.debug("Registered content-derivation job handler");

    const siteContentGenerationHandler = new SiteContentGenerationJobHandler(
      context,
    );
    context.registerJobHandler(
      "content-generation",
      siteContentGenerationHandler,
    );
    this.logger.debug("Registered content-generation job handler");

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
      this.config,
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
        handler: async (args): Promise<CommandResponse> => {
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

          if (!this.siteContentService || !this.context) {
            return {
              type: "message",
              message:
                "❌ Site content service not initialized. Please ensure the plugin is properly registered.",
            };
          }

          try {
            // Use the site content service to generate content
            const result = await this.siteContentService.generateContent({
              routeId,
              sectionId,
              force,
              dryRun,
            });

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
        handler: async (args): Promise<CommandResponse> => {
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

          if (!this.siteContentService) {
            return {
              type: "message",
              message:
                "❌ Site content service not initialized. Please ensure the plugin is properly registered.",
            };
          }

          try {
            const batchId = await this.siteContentService.promoteContent({
              routeId,
              sectionId,
              dryRun,
            });

            if (dryRun) {
              const scope = routeId
                ? sectionId
                  ? `section ${routeId}:${sectionId}`
                  : `route ${routeId}`
                : "all routes";
              return {
                type: "message",
                message: `🔍 **Dry run** - Would promote content for ${scope}. Use \`/promote\` without --dry-run to execute.`,
              };
            }

            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "batch-operation",
              message: `📤 **Promotion started** - Promoting content to production for ${scope}...`,
              batchId,
              operationCount: 1,
            };
          } catch (error) {
            this.error("Promote command failed", error);
            const errorMsg =
              error instanceof Error ? error.message : "Unknown error occurred";
            // Check for specific error about no content found
            if (errorMsg.includes("No preview content found")) {
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
            return {
              type: "message",
              message: `❌ **Promotion failed**: ${errorMsg}`,
            };
          }
        },
      },
      {
        name: "rollback",
        description:
          "Rollback all production content, a specific route, or a specific section",
        usage: "/rollback [routeId] [sectionId] [--dry-run]",
        handler: async (args): Promise<CommandResponse> => {
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

          if (!this.siteContentService) {
            return {
              type: "message",
              message:
                "❌ Site content service not initialized. Please ensure the plugin is properly registered.",
            };
          }

          try {
            const batchId = await this.siteContentService.rollbackContent({
              routeId,
              sectionId,
              dryRun,
            });

            if (dryRun) {
              const scope = routeId
                ? sectionId
                  ? `section ${routeId}:${sectionId}`
                  : `route ${routeId}`
                : "all routes";
              return {
                type: "message",
                message: `🔍 **Dry run** - Would rollback content for ${scope}. Use \`/rollback\` without --dry-run to execute.`,
              };
            }

            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "batch-operation",
              message: `↩️ **Rollback started** - Rolling back content for ${scope}...`,
              batchId,
              operationCount: 1,
            };
          } catch (error) {
            this.error("Rollback command failed", error);
            const errorMsg =
              error instanceof Error ? error.message : "Unknown error occurred";
            // Check for specific error about no content found
            if (errorMsg.includes("No production content found")) {
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
            return {
              type: "message",
              message: `❌ **Rollback failed**: ${errorMsg}`,
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
              rootJobId: `site-build-${Date.now()}`,
              progressToken: context.messageId,
              pluginId: this.id,
              operationType: "content_operations",
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
export function siteBuilderPlugin(config?: Partial<SiteBuilderConfig>): Plugin {
  return new SiteBuilderPlugin(config);
}
