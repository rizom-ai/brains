import {
  InterfacePlugin,
  type InterfacePluginContext,
  type Daemon,
  type DaemonHealth,
} from "@brains/plugins";
import { ServerManager } from "./server-manager";
import { existsSync } from "fs";
import { join } from "path";
import {
  webserverConfigSchema,
  defaultWebserverConfig,
  type WebserverConfig,
} from "./config";
import { placeholderHtml } from "./templates/placeholder";
import packageJson from "../package.json";

/**
 * Webserver interface for serving static sites
 * This is a pure serving interface - site building is handled by site-builder
 */
export class WebserverInterface extends InterfacePlugin<WebserverConfig> {
  private serverManager!: ServerManager;

  constructor(config: Partial<WebserverConfig> = {}) {
    super(
      "webserver",
      packageJson,
      config,
      webserverConfigSchema,
      defaultWebserverConfig,
    );
  }

  /**
   * Initialize server manager after config validation
   */
  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    // Initialize server manager with validated config
    this.serverManager = new ServerManager({
      logger: context.logger,
      previewDistDir: this.config.previewDistDir,
      productionDistDir: this.config.productionDistDir,
      previewPort: this.config.previewPort,
      productionPort: this.config.productionPort,
    });
  }

  /**
   * Create daemon for managing webserver lifecycle
   */
  protected override createDaemon(): Daemon | undefined {
    return {
      start: async (): Promise<void> => {
        // Ensure dist directory exists
        await this.ensureDistDirectories();

        // Auto-start both preview and production servers
        await this.serverManager.startPreviewServer();
        await this.serverManager.startProductionServer();
      },
      stop: async (): Promise<void> => {
        await this.serverManager.stopAll();
      },
      healthCheck: async (): Promise<DaemonHealth> => {
        const status = this.serverManager.getStatus();
        const isRunning = status.preview || status.production;

        return {
          status: isRunning ? "healthy" : "error",
          message: isRunning
            ? `Servers running - Preview: ${status.preview ? "up" : "down"}, Production: ${status.production ? "up" : "down"}`
            : "No servers are running",
          lastCheck: new Date(),
          details: {
            preview: status.preview,
            production: status.production,
            previewPort: this.config.previewPort,
            productionPort: this.config.productionPort,
          },
        };
      },
    };
  }

  /**
   * Ensure the dist directories exist with at least a basic index.html
   */
  private async ensureDistDirectories(): Promise<void> {
    const { mkdir, writeFile } = await import("fs/promises");

    // Create preview dist directory if it doesn't exist
    if (!existsSync(this.config.previewDistDir)) {
      await mkdir(this.config.previewDistDir, { recursive: true });
      await writeFile(
        join(this.config.previewDistDir, "index.html"),
        placeholderHtml,
      );
      this.logger.info(
        `Created preview directory at ${this.config.previewDistDir}`,
      );
    }

    // Create production dist directory if it doesn't exist
    if (!existsSync(this.config.productionDistDir)) {
      await mkdir(this.config.productionDistDir, { recursive: true });
      await writeFile(
        join(this.config.productionDistDir, "index.html"),
        placeholderHtml,
      );
      this.logger.info(
        `Created production directory at ${this.config.productionDistDir}`,
      );
    }
  }
}
