import type { Logger } from "@brains/utils";
import type { AppInfo } from "@brains/plugins";
import { resolve, join } from "path";
import { Hono, type Context as HonoContext, type Next as HonoNext } from "hono";
import { serveStatic } from "hono/bun";
import { compress } from "@hono/bun-compress";
import { etag } from "hono/etag";

export interface ServerManagerOptions {
  logger: Logger;
  previewDistDir?: string;
  productionDistDir: string;
  sharedImagesDir: string;
  previewPort?: number;
  productionPort: number;
  /** Returns app info for the /health endpoint. */
  getHealthData?: () => Promise<AppInfo>;
}

const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";

interface AppOptions {
  distDir: string;
  compress: boolean;
  /** Cache-Control for non-asset responses */
  defaultCache: string;
  /** File extensions that get immutable cache headers */
  immutableExtensions: RegExp;
  healthEndpoint: boolean;
}

/**
 * Manages in-process static file servers for production and preview sites.
 *
 * Runs Hono servers via Bun.serve() directly — no child process.
 * Serves static files with clean URLs, cache headers, image fast-path, and 404s.
 */
export class ServerManager {
  private logger: Logger;
  private options: ServerManagerOptions;
  private productionServer: ReturnType<typeof Bun.serve> | null = null;
  private previewServer: ReturnType<typeof Bun.serve> | null = null;

  constructor(options: ServerManagerOptions) {
    this.logger = options.logger;
    this.options = {
      ...options,
      productionDistDir: resolve(process.cwd(), options.productionDistDir),
      sharedImagesDir: resolve(process.cwd(), options.sharedImagesDir),
      ...(options.previewDistDir && {
        previewDistDir: resolve(process.cwd(), options.previewDistDir),
      }),
    };
  }

  async start(): Promise<void> {
    if (this.productionServer) {
      this.logger.warn("Webserver already running");
      return;
    }

    const productionApp = this.createApp({
      distDir: this.options.productionDistDir,
      compress: true,
      defaultCache: "public, max-age=3600",
      immutableExtensions: /\.(js|css|jpg|jpeg|png|gif|ico|woff|woff2)$/,
      healthEndpoint: true,
    });
    try {
      this.productionServer = Bun.serve({
        port: this.options.productionPort,
        fetch: async (req) => {
          const fastResponse = await this.serveImageFastPath(req);
          if (fastResponse) return fastResponse;
          return productionApp.fetch(req);
        },
      });
    } catch (error) {
      const msg = String(error);
      if (
        msg.includes("EADDRINUSE") ||
        msg.includes("address already in use")
      ) {
        throw new Error(
          `Port ${this.options.productionPort} is already in use. Another brain may be running — stop it first or configure a different port.`,
        );
      }
      throw error;
    }

    this.logger.info(
      `Production server listening on http://localhost:${this.productionServer.port}`,
    );

    if (this.options.previewDistDir) {
      const previewApp = this.createApp({
        distDir: this.options.previewDistDir,
        compress: false,
        defaultCache: "no-cache",
        immutableExtensions: /\.(jpg|jpeg|png|gif|ico|webp|svg|woff|woff2)$/,
        healthEndpoint: false,
      });
      this.previewServer = Bun.serve({
        port: this.options.previewPort ?? 4321,
        fetch: async (req) => {
          const fastResponse = await this.serveImageFastPath(req);
          if (fastResponse) return fastResponse;
          return previewApp.fetch(req);
        },
      });

      this.logger.info(
        `Preview server listening on http://localhost:${this.previewServer.port}`,
      );
    }
  }

  async stop(): Promise<void> {
    if (this.productionServer) {
      await this.productionServer.stop();
      this.productionServer = null;
    }
    if (this.previewServer) {
      await this.previewServer.stop();
      this.previewServer = null;
    }
    this.logger.debug("Webserver stopped");
  }

  getStatus(): {
    running: boolean;
    productionUrl: string | undefined;
    previewUrl: string | undefined;
  } {
    return {
      running: this.productionServer !== null,
      productionUrl: this.productionServer
        ? `http://localhost:${this.productionServer.port}`
        : undefined,
      previewUrl: this.previewServer
        ? `http://localhost:${this.previewServer.port}`
        : undefined,
    };
  }

  // ─── App factory ────────────────────────────────────────────────────────

  private createApp(opts: AppOptions): Hono {
    const app = new Hono();

    if (opts.healthEndpoint) {
      app.get("/health", async (c) => {
        if (this.options.getHealthData) {
          const info = await this.options.getHealthData();
          return c.json({ status: "healthy", ...info }, 200);
        }
        return c.json({ status: "healthy" }, 200);
      });
    }

    if (opts.compress) {
      app.use("/*", compress());
    }
    app.use("/*", etag());

    app.use("/*", async (c, next) => {
      await next();
      if (opts.immutableExtensions.test(c.req.path)) {
        c.header("Cache-Control", CACHE_IMMUTABLE);
      } else {
        c.header("Cache-Control", opts.defaultCache);
      }
    });

    app.use("/*", this.createCleanUrlMiddleware(opts.distDir));
    app.use("/*", serveStatic({ root: opts.distDir }));

    app.notFound(async (c) => {
      const notFoundFile = Bun.file(join(opts.distDir, "404.html"));
      if (await notFoundFile.exists()) {
        return c.html(await notFoundFile.text(), 404);
      }
      return c.text("Not Found", 404);
    });

    return app;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async serveImageFastPath(req: Request): Promise<Response | null> {
    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      return null;
    }
    if (!url.pathname.startsWith("/images/")) return null;

    const fileName = url.pathname.slice("/images/".length);
    const filePath = resolve(this.options.sharedImagesDir, fileName);
    // Prevent directory traversal
    if (!filePath.startsWith(this.options.sharedImagesDir)) return null;

    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;

    return new Response(file, {
      headers: { "Cache-Control": CACHE_IMMUTABLE },
    });
  }

  private createCleanUrlMiddleware(
    distDir: string,
  ): (c: HonoContext, next: HonoNext) => Promise<void | Response> {
    return async (c: HonoContext, next: HonoNext): Promise<void | Response> => {
      const path = c.req.path;
      if (path.includes(".") || path === "/") {
        await next();
        return;
      }

      const indexPath = resolve(distDir, `.${path}`, "index.html");
      if (!indexPath.startsWith(distDir)) {
        await next();
        return;
      }

      const indexFile = Bun.file(indexPath);
      if (await indexFile.exists()) {
        return c.html(await indexFile.text());
      }
      const htmlPath = resolve(distDir, `.${path}.html`);
      if (htmlPath.startsWith(distDir)) {
        const htmlFile = Bun.file(htmlPath);
        if (await htmlFile.exists()) {
          return c.html(await htmlFile.text());
        }
      }

      await next();
    };
  }
}

// Re-export API server components for backward compatibility with tests
export { createApiRouteHandler } from "./api-server";
