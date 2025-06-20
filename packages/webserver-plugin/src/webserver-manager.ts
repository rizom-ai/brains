import type { PluginContext } from "@brains/types";
import type { Logger } from "@brains/utils";
import { ProgressReporter } from "@brains/utils";
import { join } from "path";
import { fileURLToPath } from "url";
import { ContentGenerator } from "./content-generator";
import { SiteBuilder } from "./site-builder";
import { ServerManager } from "./server-manager";
import { copyDirectory, cleanDirectory } from "./template-utils";
import { writeFile } from "fs/promises";
import { contentRegistry } from "./content";
import { generateContentConfigFile } from "./schema-generator";

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
 * Orchestrates website generation, building, and serving
 */
export class WebserverManager {
  private logger: Logger;
  private contentGenerator: ContentGenerator;
  private siteBuilder: SiteBuilder;
  private serverManager: ServerManager;
  private lastBuildTime?: Date;
  private workingDir: string;
  private templateDir: string;

  constructor(options: WebserverManagerOptions) {
    this.logger = options.logger;

    // Template directory - use provided path or resolve relative to this module
    if (options.astroSiteTemplate) {
      this.templateDir = options.astroSiteTemplate;
    } else {
      const templateUrl = import.meta.resolve(
        "@brains/webserver-template/package.json",
      );
      const templatePath = fileURLToPath(templateUrl);
      this.templateDir = join(templatePath, "..");
    }

    this.logger.debug(`Template directory resolved to: ${this.templateDir}`);

    // Working directory where we'll copy the template
    this.workingDir = join(options.outputDir, ".astro-work");

    // Initialize components with working directory
    this.contentGenerator = new ContentGenerator({
      logger: options.logger.child("ContentGenerator"),
      context: options.context,
      astroSiteDir: this.workingDir,
      siteTitle: options.siteTitle,
      siteDescription: options.siteDescription,
      siteUrl: options.siteUrl,
    });

    this.siteBuilder = new SiteBuilder({
      logger: options.logger.child("SiteBuilder"),
      astroSiteDir: this.workingDir,
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
  async buildSite(
    options?: {
      clean?: boolean;
      environment?: "preview" | "production";
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
      // Total steps: clean(1) + copy(1) + config(1) + content(1) + build(1) = 5
      const totalSteps = 5;
      let currentStep = 0;

      // Clean working directory if requested
      if (options?.clean) {
        this.logger.debug("Cleaning working directory");
        await sendProgress?.({
          progress: currentStep++,
          total: totalSteps,
          message: "Cleaning working directory",
        });
        await cleanDirectory(this.workingDir);
      }

      // Copy template to working directory
      this.logger.debug("Copying template to working directory");
      await sendProgress?.({
        progress: currentStep++,
        total: totalSteps,
        message: "Copying template files",
      });
      await copyDirectory(this.templateDir, this.workingDir);

      // Generate content config for Astro (includes schemas)
      this.logger.debug("Generating content config with schemas");
      await sendProgress?.({
        progress: currentStep++,
        total: totalSteps,
        message: "Generating content configuration",
      });
      await this.generateContentConfig();

      // Generate content (always goes to preview environment)
      await sendProgress?.({
        progress: currentStep++,
        total: totalSteps,
        message: `Generating content`,
      });

      const progress = ProgressReporter.from(sendProgress);
      const contentProgress = progress?.createSub("Generating content");

      await this.contentGenerator.generateAll(
        contentProgress?.toCallback(),
        false,
      );

      // Build site
      await sendProgress?.({
        progress: currentStep++,
        total: totalSteps,
        message: "Building Astro site",
      });

      const buildProgress = progress?.createSub("Building site");

      await this.siteBuilder.build(buildProgress?.toCallback());

      this.lastBuildTime = new Date();
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

  /**
   * Get the working directory path (useful for testing)
   */
  getWorkingDir(): string {
    return this.workingDir;
  }

  /**
   * Generate the content/config.ts file for Astro
   */
  async generateContentConfig(): Promise<void> {
    const { mkdir } = await import("fs/promises");

    // Ensure content directory exists
    const contentDir = join(this.workingDir, "src", "content");
    await mkdir(contentDir, { recursive: true });

    // Generate content config with inline schemas
    const contentConfig = await generateContentConfigFile(contentRegistry);

    const configPath = join(contentDir, "config.ts");
    await writeFile(configPath, contentConfig);
  }

  /**
   * Generate new content (always to preview environment)
   */
  async generateContent(
    sendProgress?: (notification: {
      progress: number;
      total?: number;
      message?: string;
    }) => Promise<void>,
    force = false,
  ): Promise<void> {
    await this.contentGenerator.generateAll(sendProgress, force);
  }

  /**
   * Generate content for a specific section
   */
  async generateContentForSection(
    templateKey: string,
    environment: "preview" | "production",
    force = false,
    sendProgress?: (notification: {
      progress: number;
      total?: number;
      message?: string;
    }) => Promise<void>,
  ): Promise<{ generated: boolean }> {
    // Content generation always goes to preview environment
    if (environment !== "preview") {
      throw new Error("Content can only be generated to preview environment");
    }

    // Generate using the new API
    await this.contentGenerator.generateContent(
      templateKey,
      { force },
      sendProgress,
    );

    return { generated: true };
  }
}
