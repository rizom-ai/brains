import {
  InterfacePlugin,
  type InterfacePluginContext,
  type JobProgressEvent,
  type JobContext,
} from "@brains/plugins";
import type { Daemon, DaemonHealth } from "@brains/plugins";
import { ServerManager } from "./server-manager";
import { existsSync } from "fs";
import { join } from "path";
import { webserverConfigSchema, type WebserverConfig } from "./config";
import { placeholderHtml } from "./templates/placeholder";
import packageJson from "../package.json";

/**
 * Webserver interface for serving static sites and API routes.
 *
 * The static file server runs in-process via Bun.serve().
 * The API server runs on the main thread (needs message bus) on its own port.
 */
export class WebserverInterface extends InterfacePlugin<WebserverConfig> {
  private serverManager?: ServerManager;
  private siteUrl: string | undefined;
  private previewUrl: string | undefined;

  constructor(config: Partial<WebserverConfig> = {}) {
    super("webserver", packageJson, config, webserverConfigSchema);
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    this.siteUrl = context.siteUrl;
    this.previewUrl = context.previewUrl;

    // Initialize server manager (spawns child process for static files)
    this.serverManager = new ServerManager({
      logger: context.logger,
      productionDistDir: this.config.productionDistDir,
      sharedImagesDir: this.config.sharedImagesDir,
      productionPort: this.config.productionPort,
      ...(this.config.enablePreview &&
        this.config.previewDistDir && {
          previewDistDir: this.config.previewDistDir,
        }),
      ...(this.config.enablePreview &&
        this.config.previewPort && { previewPort: this.config.previewPort }),
      getHealthData: (): Promise<Awaited<ReturnType<typeof context.appInfo>>> =>
        context.appInfo(),
      webRoutes: context.webRoutes.getRoutes(),
      apiRoutes: context.apiRoutes.getRoutes(),
      messageBus: context.apiRoutes.getMessageBus(),
    });
  }

  private getServerManager(): ServerManager {
    if (!this.serverManager) {
      throw new Error("ServerManager not initialized — onRegister not called");
    }
    return this.serverManager;
  }

  protected override createDaemon(): Daemon | undefined {
    return {
      start: async (): Promise<void> => {
        // Ensure dist directories exist with placeholder content
        await this.ensureDistDirectories();

        // Start static file server (child process)
        await this.getServerManager().start();
      },
      stop: async (): Promise<void> => {
        await this.serverManager?.stop();
      },
      healthCheck: async (): Promise<DaemonHealth> => {
        const status = this.serverManager?.getStatus();
        const isRunning = status?.running ?? false;

        const productionUrl =
          this.siteUrl ??
          status?.productionUrl ??
          `http://localhost:${this.config.productionPort}`;
        const previewUrl =
          this.previewUrl ??
          status?.previewUrl ??
          `http://localhost:${this.config.previewPort}`;

        const urls: string[] = [];
        if (isRunning) {
          urls.push(`Production: ${productionUrl}`);
          if (status?.previewUrl) {
            urls.push(`Preview: ${previewUrl}`);
          }
        }

        return {
          status: isRunning ? "healthy" : "error",
          message: isRunning ? urls.join(", ") : "Webserver not running",
          lastCheck: new Date(),
          details: {
            preview: !!status?.previewUrl,
            production: isRunning,
            previewUrl: status?.previewUrl ? previewUrl : undefined,
            productionUrl: isRunning ? productionUrl : undefined,
          },
        };
      },
    };
  }

  protected override async handleProgressEvent(
    _event: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    // Webserver doesn't need to handle progress events
  }

  private async ensureDistDirectories(): Promise<void> {
    const { mkdir, writeFile } = await import("fs/promises");

    if (
      this.config.enablePreview &&
      this.config.previewDistDir &&
      !existsSync(this.config.previewDistDir)
    ) {
      await mkdir(this.config.previewDistDir, { recursive: true });
      await writeFile(
        join(this.config.previewDistDir, "index.html"),
        placeholderHtml,
      );
      this.logger.debug(
        `Created preview directory at ${this.config.previewDistDir}`,
      );
    }

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
