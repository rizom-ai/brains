import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { compress } from "@hono/bun-compress";
import { etag } from "hono/etag";
import type { Server } from "bun";
import type { Logger } from "@brains/utils";
import { join, resolve } from "path";
import { existsSync } from "fs";

export interface ServerManagerOptions {
  logger: Logger;
  previewDistDir: string;
  productionDistDir: string;
  previewPort: number;
  productionPort: number;
}

interface ServerState {
  preview: Server | null;
  production: Server | null;
}

/**
 * Manages HTTP servers for serving static sites
 */
export class ServerManager {
  private logger: Logger;
  private options: ServerManagerOptions;
  private servers: ServerState = {
    preview: null,
    production: null,
  };

  constructor(options: ServerManagerOptions) {
    this.logger = options.logger;
    // Resolve paths relative to process.cwd()
    this.options = {
      ...options,
      previewDistDir: resolve(process.cwd(), options.previewDistDir),
      productionDistDir: resolve(process.cwd(), options.productionDistDir),
    };
  }

  /**
   * Create preview server app
   */
  private createPreviewApp(): Hono {
    const app = new Hono();

    // Add middleware
    app.use("/*", etag());

    // No caching for preview
    app.use("/*", async (c, next) => {
      await next();
      c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    });

    // Serve static files
    app.use(
      "/*",
      serveStatic({
        root: this.options.previewDistDir,
        rewriteRequestPath: (path) => {
          // Handle clean URLs
          if (!path.includes(".") && path !== "/") {
            // First try directory with index.html
            const indexPath = path + "/index.html";
            const fullIndexPath = join(this.options.previewDistDir, indexPath);
            if (existsSync(fullIndexPath)) {
              return indexPath;
            }
            // Then try with .html extension
            return path + ".html";
          }
          return path;
        },
      }),
    );

    // 404 handler
    app.notFound(async (c) => {
      const notFoundPath = join(this.options.previewDistDir, "404.html");
      if (existsSync(notFoundPath)) {
        const file = await Bun.file(notFoundPath).text();
        return c.html(file, 404);
      }
      return c.text("Not Found", 404);
    });

    return app;
  }

  /**
   * Create production server app
   */
  private createProductionApp(): Hono {
    const app = new Hono();

    // Add middleware
    app.use("/*", compress()); // Compression for production
    app.use("/*", etag());

    // Production caching
    app.use("/*", async (c, next) => {
      await next();

      const path = c.req.path;

      // Cache static assets for 1 year
      if (path.match(/\.(js|css|jpg|jpeg|png|gif|ico|woff|woff2)$/)) {
        c.header("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        // Cache HTML for 1 hour
        c.header("Cache-Control", "public, max-age=3600");
      }
    });

    // Serve static files
    app.use(
      "/*",
      serveStatic({
        root: this.options.productionDistDir,
        rewriteRequestPath: (path) => {
          // Handle clean URLs
          if (!path.includes(".") && path !== "/") {
            // First try directory with index.html
            const indexPath = path + "/index.html";
            const fullIndexPath = join(this.options.previewDistDir, indexPath);
            if (existsSync(fullIndexPath)) {
              return indexPath;
            }
            // Then try with .html extension
            return path + ".html";
          }
          return path;
        },
      }),
    );

    // 404 handler
    app.notFound(async (c) => {
      const notFoundPath = join(this.options.productionDistDir, "404.html");
      if (existsSync(notFoundPath)) {
        const file = await Bun.file(notFoundPath).text();
        return c.html(file, 404);
      }
      return c.text("Not Found", 404);
    });

    return app;
  }

  /**
   * Start the preview server
   */
  async startPreviewServer(): Promise<string> {
    if (this.servers.preview) {
      this.logger.warn("Preview server already running");
      return `http://localhost:${this.options.previewPort}`;
    }

    if (!existsSync(this.options.previewDistDir)) {
      throw new Error("No preview build found. Run build_site first.");
    }

    this.logger.info(
      `Starting preview server on port ${this.options.previewPort}`,
    );

    const app = this.createPreviewApp();

    this.servers.preview = Bun.serve({
      port: this.options.previewPort,
      fetch: app.fetch,
    });

    const url = `http://localhost:${this.options.previewPort}`;
    this.logger.info(`Preview server started at ${url}`);
    return url;
  }

  /**
   * Start the production server
   */
  async startProductionServer(): Promise<string> {
    if (this.servers.production) {
      this.logger.warn("Production server already running");
      return `http://localhost:${this.options.productionPort}`;
    }

    if (!existsSync(this.options.productionDistDir)) {
      throw new Error("No build found. Run build_site first.");
    }

    this.logger.info(
      `Starting production server on port ${this.options.productionPort}`,
    );

    const app = this.createProductionApp();

    this.servers.production = Bun.serve({
      port: this.options.productionPort,
      fetch: app.fetch,
    });

    const url = `http://localhost:${this.options.productionPort}`;
    this.logger.info(`Production server started at ${url}`);
    return url;
  }

  /**
   * Stop a server
   */
  async stopServer(type: "preview" | "production"): Promise<void> {
    const server = this.servers[type];
    if (!server) {
      this.logger.warn(`${type} server not running`);
      return;
    }

    await server.stop();
    this.servers[type] = null;
    this.logger.info(`${type} server stopped`);
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    await this.stopServer("preview");
    await this.stopServer("production");
  }

  /**
   * Get server status
   */
  getStatus(): {
    preview: boolean;
    production: boolean;
    previewUrl: string | undefined;
    productionUrl: string | undefined;
  } {
    return {
      preview: !!this.servers.preview,
      production: !!this.servers.production,
      previewUrl: this.servers.preview
        ? `http://localhost:${this.options.previewPort}`
        : undefined,
      productionUrl: this.servers.production
        ? `http://localhost:${this.options.productionPort}`
        : undefined,
    };
  }
}
