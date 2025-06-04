import type { Registry, PluginContext } from "@brains/types";
import type { Logger } from "@brains/utils";
import { join } from "path";
import { fileURLToPath } from "url";
import { ContentGenerator } from "./content-generator";
import { SiteBuilder } from "./site-builder";
import { ServerManager } from "./server-manager";
import { copyDirectory, cleanDirectory } from "./template-utils";
import { writeFile } from "fs/promises";
import contentSchemasSource from "./content-schemas.txt";

export interface WebserverManagerOptions {
  logger: Logger;
  registry: Registry;
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
      registry: options.registry,
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
  async buildSite(options?: { clean?: boolean }): Promise<void> {
    this.logger.info("Starting site build");

    try {
      // Clean working directory if requested
      if (options?.clean) {
        this.logger.debug("Cleaning working directory");
        await cleanDirectory(this.workingDir);
      }

      // Copy template to working directory
      this.logger.debug("Copying template to working directory");
      await copyDirectory(this.templateDir, this.workingDir);

      // Generate schemas.ts file for the template
      this.logger.debug("Generating schemas.ts file");
      await this.generateSchemas();

      // Generate content config for Astro
      this.logger.debug("Generating content config");
      await this.generateContentConfig();

      // Generate content
      await this.contentGenerator.generateAll();

      // Build site
      await this.siteBuilder.build();

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

  /**
   * Generate the content/config.ts file for Astro
   */
  private async generateContentConfig(): Promise<void> {
    const { mkdir } = await import("fs/promises");

    // Ensure content directory exists
    const contentDir = join(this.workingDir, "src", "content");
    await mkdir(contentDir, { recursive: true });

    // Generate content config that imports from the generated schemas
    const contentConfig = `import { defineCollection } from "astro:content";
import { landingPageSchema, dashboardSchema } from "../schemas";

const landingCollection = defineCollection({
  type: "data",
  schema: landingPageSchema,
});

const dashboardCollection = defineCollection({
  type: "data",
  schema: dashboardSchema,
});

export const collections = {
  landing: landingCollection,
  dashboard: dashboardCollection,
};
`;

    const configPath = join(contentDir, "config.ts");
    await writeFile(configPath, contentConfig);
  }

  /**
   * Generate the schemas.ts file for the template
   * This writes the imported content-schemas source to the template
   */
  private async generateSchemas(): Promise<void> {
    const destSchemaPath = join(this.workingDir, "src", "schemas.ts");
    
    this.logger.debug("Writing schemas.ts to template", { to: destSchemaPath });
    await writeFile(destSchemaPath, contentSchemasSource);
  }
}
