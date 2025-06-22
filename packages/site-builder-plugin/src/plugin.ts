import { BasePlugin } from "@brains/utils";
import type { PluginContext, PluginTool, PluginResource } from "@brains/types";
import { SiteBuilder } from "./site-builder";
import { PageRegistry } from "./page-registry";
import { LayoutRegistry } from "./layout-registry";
import { z } from "zod";

/**
 * Configuration schema for the site builder plugin
 */
const siteBuilderConfigSchema = z.object({
  outputDir: z.string().describe("Output directory for built sites"),
  workingDir: z.string().optional().describe("Working directory for builds"),
  siteConfig: z
    .object({
      title: z.string(),
      description: z.string(),
      url: z.string().optional(),
    })
    .default({
      title: "Personal Brain",
      description: "A knowledge management system",
    })
    .optional(),
});

type SiteBuilderConfig = z.infer<typeof siteBuilderConfigSchema>;

/**
 * Site Builder Plugin
 * Provides static site generation capabilities
 */
export class SiteBuilderPlugin extends BasePlugin<SiteBuilderConfig> {
  private siteBuilder?: SiteBuilder;

  constructor(config: unknown = {}) {
    super(
      "site-builder",
      "Site Builder Plugin",
      "Provides static site generation capabilities",
      config,
      siteBuilderConfigSchema,
    );
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    await super.onRegister(context);

    // Initialize the site builder with plugin context
    this.siteBuilder = SiteBuilder.getInstance(
      context.logger.child("SiteBuilder"),
      context,
    );

    // Register site builder in the registry for other plugins to use
    context.registry.register("siteBuilder", () => this.siteBuilder);
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    const tools: PluginTool[] = [];

    // Build tool - uses plugin configuration, no parameters needed
    tools.push(
      this.createTool(
        "build",
        "Build a static site from registered pages",
        {
          enableContentGeneration: z
            .boolean()
            .optional()
            .describe("Generate content for pages that don't have it"),
        },
        async (input, context): Promise<Record<string, unknown>> => {
          if (!this.siteBuilder) {
            throw new Error("Site builder not initialized");
          }

          // Use the plugin's configuration
          const config = this.config;
          const { enableContentGeneration } = input as {
            enableContentGeneration?: boolean;
          };

          try {
            const result = await this.siteBuilder.build(
              {
                outputDir: config.outputDir,
                workingDir: config.workingDir,
                enableContentGeneration: enableContentGeneration ?? false,
                siteConfig: config.siteConfig || {
                  title: "Personal Brain",
                  description: "A knowledge management system",
                },
              },
              context?.sendProgress,
            );

            return {
              success: result.success,
              pagesBuilt: result.pagesBuilt,
              outputDir: config.outputDir,
              errors: result.errors,
              warnings: result.warnings,
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            return {
              success: false,
              error: message,
            };
          }
        },
        "anchor", // Internal tool - modifies filesystem
      ),
    );

    // List pages tool
    tools.push(
      this.createTool(
        "list_pages",
        "List all registered pages",
        {},
        async (): Promise<Record<string, unknown>> => {
          const pageRegistry = PageRegistry.getInstance();
          const pages = pageRegistry.list();

          return {
            success: true,
            pages: pages.map((p) => ({
              path: p.path,
              title: p.title,
              description: p.description,
              pluginId: p.pluginId,
              sections: p.sections.length,
            })),
          };
        },
        "public",
      ),
    );

    // List layouts tool
    tools.push(
      this.createTool(
        "list_layouts",
        "List all registered layouts",
        {},
        async (): Promise<Record<string, unknown>> => {
          const layoutRegistry = LayoutRegistry.getInstance();
          const layouts = layoutRegistry.list();

          return {
            success: true,
            layouts: layouts.map((l) => ({
              name: l.name,
              description: l.description,
              component: l.component,
            })),
          };
        },
        "public",
      ),
    );

    return tools;
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
}

/**
 * Factory function to create the plugin
 */
export function siteBuilderPlugin(config?: unknown): SiteBuilderPlugin {
  return new SiteBuilderPlugin(config);
}
