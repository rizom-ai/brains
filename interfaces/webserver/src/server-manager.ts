import { Hono, type Context } from "hono";
import { serveStatic } from "hono/bun";
import { compress } from "@hono/bun-compress";
import { etag } from "hono/etag";
import type { Server } from "bun";
import type { Logger } from "@brains/utils";
import { join, resolve } from "path";
import { existsSync } from "fs";
import type { RegisteredApiRoute, IMessageBus } from "@brains/plugins";

// WORKAROUND: Capture native Response before @hono/node-server can override it.
// The MCP SDK's streamableHttp.js imports @hono/node-server which calls getRequestListener(),
// overriding global.Response with a custom _Response class. Bun.serve doesn't recognize
// _Response objects, causing "Expected a Response object" errors.
// TODO: File issue with MCP SDK - they shouldn't override globals on Bun.
const NativeResponse = globalThis.Response;

/**
 * Create an API route handler for a registered plugin route
 * Handles request parsing, tool invocation via message bus, and response formatting
 */
export function createApiRouteHandler(
  route: RegisteredApiRoute,
  messageBus: IMessageBus,
): (c: Context) => Promise<Response> {
  return async (c: Context): Promise<Response> => {
    const req = c.req.raw;
    const contentType = req.headers.get("content-type") ?? "";
    const acceptsJson = req.headers.get("accept")?.includes("application/json");

    // Parse request body
    let args: Record<string, unknown> = {};
    if (contentType.includes("application/json")) {
      args = await req.json();
    } else if (contentType.includes("form")) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        args[key] = value;
      }
    }

    // Call tool via message bus
    const toolName = `${route.pluginId}_${route.definition.tool}`;
    const response = await messageBus.send(
      `plugin:${route.pluginId}:tool:execute`,
      {
        toolName,
        args,
        interfaceType: "webserver",
        userId: "anonymous",
      },
      "webserver",
    );

    const success = "success" in response && response.success === true;
    const data = "data" in response ? response.data : response;

    // Return response based on Accept header and route config
    if (acceptsJson) {
      return c.json({ success, data }, success ? 200 : 400);
    }

    // Redirect for form submissions
    if (success && route.definition.successRedirect) {
      return c.redirect(route.definition.successRedirect);
    }
    if (!success && route.definition.errorRedirect) {
      return c.redirect(route.definition.errorRedirect);
    }

    // Default JSON response if no redirect configured
    return c.json({ success, data }, success ? 200 : 400);
  };
}

export interface ServerManagerOptions {
  logger: Logger;
  previewDistDir?: string;
  productionDistDir: string;
  previewPort?: number;
  productionPort: number;
}

interface ServerState {
  preview: Server<unknown> | null;
  production: Server<unknown> | null;
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
  private apiRoutes: RegisteredApiRoute[] = [];
  private messageBus: IMessageBus | null = null;

  constructor(options: ServerManagerOptions) {
    this.logger = options.logger;
    // Resolve paths relative to process.cwd()
    this.options = {
      logger: options.logger,
      productionDistDir: resolve(process.cwd(), options.productionDistDir),
      productionPort: options.productionPort,
      ...(options.previewDistDir && {
        previewDistDir: resolve(process.cwd(), options.previewDistDir),
      }),
      ...(options.previewPort && { previewPort: options.previewPort }),
    };
  }

  /**
   * Set API routes to be mounted when servers start
   */
  setApiRoutes(routes: RegisteredApiRoute[], messageBus: IMessageBus): void {
    this.apiRoutes = routes;
    this.messageBus = messageBus;
    this.logger.debug(`Configured ${routes.length} API routes`);
  }

  /**
   * Check if API routes have been configured
   */
  hasApiRoutes(): boolean {
    return this.apiRoutes.length > 0 && this.messageBus !== null;
  }

  /**
   * Create preview server app
   */
  private createPreviewApp(): Hono {
    if (!this.options.previewDistDir) {
      throw new Error("Preview dist dir not configured");
    }

    const previewDistDir = this.options.previewDistDir;
    const app = new Hono();

    // Add middleware
    app.use("/*", etag());

    // No caching for preview
    app.use("/*", async (c, next) => {
      await next();
      c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    });

    // Mount API routes before static files
    if (this.messageBus) {
      this.mountApiRoutes(app, this.apiRoutes, this.messageBus);
    }

    // Serve static files
    app.use(
      "/*",
      serveStatic({
        root: previewDistDir,
        rewriteRequestPath: (path) => {
          // Handle clean URLs
          if (!path.includes(".") && path !== "/") {
            // First try directory with index.html
            const indexPath = path + "/index.html";
            const fullIndexPath = join(previewDistDir, indexPath);
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
      const notFoundPath = join(previewDistDir, "404.html");
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

    // Mount API routes before static files
    if (this.messageBus) {
      this.mountApiRoutes(app, this.apiRoutes, this.messageBus);
    }

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
            const fullIndexPath = join(
              this.options.productionDistDir,
              indexPath,
            );
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
    if (!this.options.previewPort || !this.options.previewDistDir) {
      this.logger.warn("Preview server not configured, skipping");
      return "";
    }

    if (this.servers.preview) {
      this.logger.warn("Preview server already running");
      return `http://localhost:${this.options.previewPort}`;
    }

    if (!existsSync(this.options.previewDistDir)) {
      throw new Error("No preview build found. Run build_site first.");
    }

    this.logger.debug(
      `Starting preview server on port ${this.options.previewPort}`,
    );

    const app = this.createPreviewApp();

    this.servers.preview = Bun.serve({
      port: this.options.previewPort,
      fetch: async (req) => {
        const res = await app.fetch(req);
        // Ensure native Response for Bun.serve (see WORKAROUND comment at top)
        if (res.constructor === NativeResponse) return res;
        return new NativeResponse(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      },
    });

    const url = `http://localhost:${this.options.previewPort}`;
    this.logger.debug(`Preview server started at ${url}`);
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

    this.logger.debug(
      `Starting production server on port ${this.options.productionPort}`,
    );

    const app = this.createProductionApp();

    this.servers.production = Bun.serve({
      port: this.options.productionPort,
      fetch: async (req) => {
        const res = await app.fetch(req);
        // Ensure native Response for Bun.serve (see WORKAROUND comment at top)
        if (res.constructor === NativeResponse) return res;
        return new NativeResponse(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      },
    });

    const url = `http://localhost:${this.options.productionPort}`;
    this.logger.debug(`Production server started at ${url}`);
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
    this.logger.debug(`${type} server stopped`);
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

  /**
   * Mount API routes from plugins onto a Hono app
   * Routes are mounted at /api/{pluginId}/{path}
   */
  mountApiRoutes(
    app: Hono,
    routes: RegisteredApiRoute[],
    messageBus: IMessageBus,
  ): void {
    for (const route of routes) {
      const handler = createApiRouteHandler(route, messageBus);
      const method = route.definition.method.toLowerCase() as
        | "get"
        | "post"
        | "put"
        | "delete";

      app[method](route.fullPath, handler);
      this.logger.debug(
        `Mounted API route: ${route.definition.method} ${route.fullPath} -> ${route.pluginId}_${route.definition.tool}`,
      );
    }
  }
}
