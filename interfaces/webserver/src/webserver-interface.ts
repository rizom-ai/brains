import {
  InterfacePlugin,
  type InterfacePluginContext,
  type JobProgressEvent,
  type JobContext,
} from "@brains/plugins";
import type { Daemon, DaemonHealth } from "@brains/daemon-registry";
import { ServerManager } from "./server-manager";
import { existsSync } from "fs";
import { join } from "path";
import { webserverConfigSchema, type WebserverConfig } from "./config";
import { placeholderHtml } from "./templates/placeholder";
import packageJson from "../package.json";

/**
 * Webserver interface for serving static sites
 * This is a pure serving interface - site building is handled by site-builder
 */
export class WebserverInterface extends InterfacePlugin<WebserverConfig> {
  private serverManager!: ServerManager;

  constructor(config: Partial<WebserverConfig> = {}) {
    super("webserver", packageJson, config, webserverConfigSchema);
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
      productionDistDir: this.config.productionDistDir,
      productionPort: this.config.productionPort,
      ...(this.config.previewDistDir && {
        previewDistDir: this.config.previewDistDir,
      }),
      ...(this.config.previewPort && { previewPort: this.config.previewPort }),
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

        // Auto-start servers based on configuration
        if (this.config.previewPort && this.config.previewDistDir) {
          await this.serverManager.startPreviewServer();
          this.logger.info("Preview server enabled");
        } else {
          this.logger.info("Preview server disabled (not configured)");
        }

        await this.serverManager.startProductionServer();
      },
      stop: async (): Promise<void> => {
        await this.serverManager.stopAll();
      },
      healthCheck: async (): Promise<DaemonHealth> => {
        const status = this.serverManager.getStatus();
        const isRunning = status.preview || status.production;

        const previewUrl =
          this.config.previewDomain ??
          (this.config.productionDomain
            ? this.config.productionDomain.replace("://", "://preview.")
            : `http://localhost:${this.config.previewPort}`);
        const productionUrl =
          this.config.productionDomain ??
          `http://localhost:${this.config.productionPort}`;

        const urls: string[] = [];
        if (status.preview) {
          urls.push(`Preview: ${previewUrl}`);
        }
        if (status.production) {
          urls.push(`Production: ${productionUrl}`);
        }

        return {
          status: isRunning ? "healthy" : "error",
          message: isRunning ? urls.join(", ") : "No servers are running",
          lastCheck: new Date(),
          details: {
            preview: status.preview,
            production: status.production,
            previewUrl: status.preview ? previewUrl : undefined,
            productionUrl: status.production ? productionUrl : undefined,
          },
        };
      },
    };
  }

  /**
   * Handle progress events (no-op for webserver interface)
   */
  protected override async handleProgressEvent(
    _event: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    // Webserver doesn't need to handle progress events
  }

  /**
   * Ensure the dist directories exist with at least a basic index.html
   */
  private async ensureDistDirectories(): Promise<void> {
    const { mkdir, writeFile } = await import("fs/promises");

    // Create preview dist directory if configured and doesn't exist
    if (this.config.previewDistDir && !existsSync(this.config.previewDistDir)) {
      await mkdir(this.config.previewDistDir, { recursive: true });
      await writeFile(
        join(this.config.previewDistDir, "index.html"),
        placeholderHtml,
      );
      this.logger.debug(
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
      this.logger.debug(
        `Created production directory at ${this.config.productionDistDir}`,
      );
    }
  }
}
