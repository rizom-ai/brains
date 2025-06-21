import type { PluginContext } from "@brains/types";
import type { Logger } from "@brains/utils";
import type { SiteBuilder } from "@brains/site-builder-plugin";
import { ServerManager } from "./server-manager";
import { join } from "path";

export interface WebserverManagerOptions {
  logger: Logger;
  context: PluginContext;
  outputDir: string;
  astroSiteTemplate?: string;
  previewPort: number;
  productionPort: number;
  siteTitle: string;
  siteDescription: string;
  siteUrl?: string | undefined;
}

/**
 * Orchestrates website building (via site-builder) and serving
 */
export class WebserverManager {
  private logger: Logger;
  private context: PluginContext;
  private serverManager: ServerManager;
  private options: WebserverManagerOptions;

  constructor(options: WebserverManagerOptions) {
    this.logger = options.logger;
    this.context = options.context;
    this.options = options;

    // Initialize server manager for serving built sites
    this.serverManager = new ServerManager({
      logger: options.logger.child("ServerManager"),
      distDir: join(options.outputDir, "dist"),
      previewPort: options.previewPort,
      productionPort: options.productionPort,
    });
  }

  /**
   * Generate and build the site
   */
  async buildSite(
    options?: {
      clean?: boolean;
      environment?: "preview" | "production";
      force?: boolean;
    },
    sendProgress?: (notification: {
      progress: number;
      total?: number;
      message?: string;
    }) => Promise<void>,
  ): Promise<void> {
    const environment = options?.environment ?? "preview";
    this.logger.info(`Starting site build for ${environment} environment`);

    try {
      // Get site builder from registry
      if (!this.context.registry.has("siteBuilder")) {
        throw new Error(
          "SiteBuilder not found in registry. Make sure site-builder-plugin is loaded.",
        );
      }

      const siteBuilder =
        this.context.registry.resolve<SiteBuilder>("siteBuilder");

      // Build the site using site-builder
      const buildResult = await siteBuilder.build(
        {
          outputDir: this.options.outputDir,
          enableContentGeneration: true,
          siteConfig: {
            title: this.options.siteTitle,
            description: this.options.siteDescription,
            url: this.options.siteUrl,
          },
        },
        sendProgress,
      );

      if (!buildResult.success) {
        throw new Error(
          `Site build failed: ${buildResult.errors?.join(", ") || "Unknown error"}`,
        );
      }

      this.logger.info("Site build completed");
    } catch (error) {
      this.logger.error("Site build failed", error);
      throw error;
    }
  }

  /**
   * Start preview server
   */
  async startPreviewServer(): Promise<string> {
    return this.serverManager.startPreviewServer();
  }

  /**
   * Start production server
   */
  async startProductionServer(): Promise<string> {
    return this.serverManager.startProductionServer();
  }

  /**
   * Stop a server
   */
  async stopServer(type: "preview" | "production"): Promise<void> {
    await this.serverManager.stopServer(type);
  }

  /**
   * Build and preview in one command
   */
  async preview(
    sendProgress?: (notification: {
      progress: number;
      total?: number;
      message?: string;
    }) => Promise<void>,
  ): Promise<string> {
    await this.buildSite(undefined, sendProgress);
    return this.startPreviewServer();
  }

  /**
   * Get server status
   */
  getStatus(): {
    servers: {
      preview: boolean;
      production: boolean;
      previewUrl: string | undefined;
      productionUrl: string | undefined;
    };
  } {
    return {
      servers: this.serverManager.getStatus(),
    };
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    await this.serverManager.stopAll();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stopAll();
  }
}
