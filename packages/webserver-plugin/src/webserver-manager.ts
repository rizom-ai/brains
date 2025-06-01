import type { Registry } from "@brains/types";
import type { Logger } from "@brains/utils";
import { join } from "path";
import { ContentGenerator } from "./content-generator";
import { SiteBuilder } from "./site-builder";
import { ServerManager } from "./server-manager";

export interface WebserverManagerOptions {
  logger: Logger;
  registry: Registry;
  outputDir: string;
  previewPort: number;
  productionPort: number;
  siteTitle: string;
  siteDescription: string;
  siteUrl?: string | undefined;
}

/**
 * Orchestrates website generation, building, and serving
 */
export class WebserverManager {
  private logger: Logger;
  private contentGenerator: ContentGenerator;
  private siteBuilder: SiteBuilder;
  private serverManager: ServerManager;
  private lastBuildTime?: Date;

  constructor(options: WebserverManagerOptions) {
    this.logger = options.logger;

    // Astro site is located relative to the plugin
    const astroSiteDir = join(import.meta.dir, "astro-site");

    // Initialize components
    this.contentGenerator = new ContentGenerator({
      logger: options.logger.child("ContentGenerator"),
      registry: options.registry,
      astroSiteDir,
      siteTitle: options.siteTitle,
      siteDescription: options.siteDescription,
      siteUrl: options.siteUrl,
    });

    this.siteBuilder = new SiteBuilder({
      logger: options.logger.child("SiteBuilder"),
      astroSiteDir,
    });

    this.serverManager = new ServerManager({
      logger: options.logger.child("ServerManager"),
      distDir: this.siteBuilder.getDistDir(),
      previewPort: options.previewPort,
      productionPort: options.productionPort,
    });
  }

  /**
   * Generate and build the site
   */
  async buildSite(options?: { clean?: boolean }): Promise<void> {
    this.logger.info("Starting site build");

    // Clean if requested
    if (options?.clean) {
      await this.siteBuilder.clean();
    }

    // Generate content
    await this.contentGenerator.generateAll();

    // Build site
    await this.siteBuilder.build();

    this.lastBuildTime = new Date();
    this.logger.info("Site build completed");
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
  async preview(): Promise<string> {
    await this.buildSite();
    return this.startPreviewServer();
  }

  /**
   * Get status of all components
   */
  getStatus(): {
    hasBuild: boolean;
    lastBuild: string | undefined;
    servers: {
      preview: boolean;
      production: boolean;
      previewUrl: string | undefined;
      productionUrl: string | undefined;
    };
  } {
    const serverStatus = this.serverManager.getStatus();

    return {
      hasBuild: this.siteBuilder.hasBuild(),
      lastBuild: this.lastBuildTime?.toISOString(),
      servers: serverStatus,
    };
  }

  /**
   * Cleanup - stop all servers
   */
  async cleanup(): Promise<void> {
    this.logger.info("Cleaning up webserver manager");
    await this.serverManager.stopAll();
  }
}
