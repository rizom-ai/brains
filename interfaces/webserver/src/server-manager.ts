import { SITE_BUILD_MANIFEST_PATH } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { AppInfo, RuntimeReadiness, IMessageBus } from "@brains/plugins";
import type {
  RegisteredHandlerHttpRoute,
  RegisteredHttpRoute,
  RegisteredToolHttpRoute,
} from "@brains/plugins/internal/http-routes";
import { resolve, join, sep } from "path";
import { Hono, type Context as HonoContext, type Next as HonoNext } from "hono";
import { serveStatic } from "hono/bun";
import { compress } from "@hono/bun-compress";
import { etag } from "hono/etag";
import { createApiRouteHandler } from "./api-server";

/** True if filePath resolves inside dir (or is dir itself). */
export function isPathContained(filePath: string, dir: string): boolean {
  return filePath === dir || filePath.startsWith(dir + sep);
}

export interface ServerManagerOptions {
  logger: Logger;
  previewDistDir?: string;
  productionDistDir: string;
  sharedImagesDir: string;
  productionPort: number;
  /** Returns app metadata for operational diagnostics. */
  getOperationalInfo?: () => Promise<AppInfo>;
  /** Returns dependency and resource state for readiness checks. */
  getReadinessData?: () => Promise<RuntimeReadiness>;
  /** Resolve finalized routes when the server starts. Invoked exactly once. */
  getRoutes?: () => readonly RegisteredHttpRoute[];
  /** Message bus used to execute plugin API routes. */
  messageBus?: IMessageBus;
  /**
   * Bun.serve idle timeout in seconds. Defaults to {@link WEBSERVER_IDLE_TIMEOUT_SECONDS}.
   */
  idleTimeout?: number;
  /** Override for `Bun.serve`, for tests. Defaults to `Bun.serve`. */
  serve?: ServeFn;
}

const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";

function resolveConfiguredRoutes(
  options: ServerManagerOptions,
): readonly RegisteredHttpRoute[] {
  return options.getRoutes?.() ?? [];
}

/**
 * Idle timeout (seconds) for the shared Bun server.
 *
 * Streaming routes like the web-chat `POST /api/chat` keep a single response
 * open while the agent runs synchronously (cold model init + tool loop + an
 * uploaded file's full content in the prompt). No bytes flow during that wait,
 * and Bun's default idle timeout is only 10s — which closes the socket on a
 * slow first turn and surfaces to the client as a generic network error.
 * Stream writes do NOT reset Bun's idle timer, so a keepalive heartbeat cannot
 * help; the timeout itself must cover the worst-case turn. 255s is Bun's max.
 */
export const WEBSERVER_IDLE_TIMEOUT_SECONDS = 255;

interface AppOptions {
  distDir: string;
  compress: boolean;
  /** Cache-Control for non-asset responses */
  defaultCache: string;
  /** File extensions that get immutable cache headers */
  immutableExtensions: RegExp;
  /**
   * File extensions that must revalidate on every request (no-cache).
   * For assets at stable URLs whose content changes on rebuild (main.css,
   * boot.js) — a max-age lets the CDN edge serve pages against stale
   * styles/scripts for the full window. Checked before immutableExtensions.
   */
  revalidateExtensions?: RegExp;
  healthEndpoint: boolean;
}

/**
 * Manages in-process static file servers for production and preview sites.
 *
 * Runs Hono servers via Bun.serve() directly — no child process.
 * Serves static files with clean URLs, cache headers, image fast-path, and 404s.
 */
/**
 * What this manager needs of a running server: the port it bound and a way to
 * stop it. Bun's Server type is far wider, and asking for all of it meant a
 * test could not stand one in without asserting it was one.
 */
export interface RunningServer {
  readonly port: number | undefined;
  stop(): Promise<void> | void;
}

/** The options this manager passes, and the server it expects back. */
export type ServeFn = (options: {
  port: number;
  idleTimeout: number;
  fetch: (req: Request) => Promise<Response> | Response;
}) => RunningServer;

export class ServerManager {
  private logger: Logger;
  private options: ServerManagerOptions;
  private routes: readonly RegisteredHttpRoute[] = Object.freeze([]);
  private productionServer: RunningServer | null = null;

  private isPreviewHost(host: string | null): boolean {
    if (!host) {
      return false;
    }

    const normalizedHost = host.replace(/:\d+$/, "").toLowerCase();
    return /^(?:preview\..+|.+-preview\..+)$/.test(normalizedHost);
  }

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

    this.routes = Object.freeze([...resolveConfiguredRoutes(this.options)]);

    const productionApp = this.createApp({
      distDir: this.options.productionDistDir,
      compress: true,
      defaultCache: "public, max-age=3600",
      // js/css are rebuilt in place at stable URLs — never immutable.
      immutableExtensions: /\.(jpg|jpeg|png|gif|ico|webp|svg|woff|woff2)$/,
      revalidateExtensions: /\.(js|css)$/,
      healthEndpoint: true,
    });
    const previewApp = this.options.previewDistDir
      ? this.createApp({
          distDir: this.options.previewDistDir,
          compress: false,
          defaultCache: "no-cache",
          immutableExtensions: /\.(jpg|jpeg|png|gif|ico|webp|svg|woff|woff2)$/,
          healthEndpoint: false,
        })
      : undefined;
    const serve = this.options.serve ?? Bun.serve;
    try {
      this.productionServer = serve({
        port: this.options.productionPort,
        idleTimeout: this.options.idleTimeout ?? WEBSERVER_IDLE_TIMEOUT_SECONDS,
        fetch: async (req) => {
          const fastResponse = await this.serveImageFastPath(req);
          if (fastResponse) return fastResponse;

          const requestPath = new URL(req.url).pathname;
          if (requestPath === "/health" || requestPath.startsWith("/health/")) {
            return productionApp.fetch(req);
          }

          if (previewApp && this.isPreviewHost(req.headers.get("host"))) {
            return previewApp.fetch(req);
          }

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
          { cause: error },
        );
      }
      throw error;
    }

    this.logger.info(
      `Production server listening on http://localhost:${this.productionServer.port}`,
    );
  }

  async stop(): Promise<void> {
    if (this.productionServer) {
      await this.productionServer.stop();
      this.productionServer = null;
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
      previewUrl:
        this.productionServer && this.options.previewDistDir
          ? `http://localhost:${this.productionServer.port}`
          : undefined,
    };
  }

  // ─── App factory ────────────────────────────────────────────────────────

  private createApp(opts: AppOptions): Hono {
    const app = new Hono();

    if (opts.healthEndpoint) {
      app.all("/health", (c) => c.notFound());
      app.get("/health/live", (c) =>
        c.json(
          {
            status: "alive",
            uptime: Math.floor(process.uptime()),
            checkedAt: new Date().toISOString(),
          },
          200,
        ),
      );
      app.get("/health/ready", async (c) => {
        const readiness = await this.getReadinessData();
        return c.json(readiness, readiness.status === "ready" ? 200 : 503);
      });
      app.get("/health/operate", async (c) => {
        let readiness = await this.getReadinessData();
        let info: AppInfo | undefined;
        if (this.options.getOperationalInfo) {
          try {
            info = await this.options.getOperationalInfo();
          } catch (error) {
            readiness = {
              ...readiness,
              operationalStatus: "degraded",
              checks: [
                ...readiness.checks,
                {
                  name: "app-info",
                  status: "unhealthy",
                  message: getErrorMessage(error),
                },
              ],
            };
          }
        }
        return c.json(
          { ...readiness, ...(info && { app: info }) },
          readiness.operationalStatus === "operational" ? 200 : 503,
        );
      });
    }

    app.use("/*", async (c, next) => {
      const dynamicResponse = await this.handleDynamicRoute(c, opts);
      if (dynamicResponse) {
        return dynamicResponse;
      }

      return next();
    });

    if (opts.compress) {
      app.use("/*", compress());
    }
    app.use("/*", etag());

    app.use("/*", async (c, next) => {
      await next();
      if (opts.revalidateExtensions?.test(c.req.path)) {
        c.header("Cache-Control", "no-cache");
      } else if (opts.immutableExtensions.test(c.req.path)) {
        c.header("Cache-Control", CACHE_IMMUTABLE);
      } else {
        c.header("Cache-Control", opts.defaultCache);
      }
    });

    // The site build commits its internal manifest into the generation the
    // active pointer resolves to. Block that file explicitly without rejecting
    // legitimate public dot paths such as `/.well-known/agent-card.json` or a
    // site-package verification asset.
    app.use("/*", async (c, next) => {
      if (c.req.path === SITE_BUILD_MANIFEST_PATH) return c.notFound();
      return next();
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

  private async getReadinessData(): Promise<RuntimeReadiness> {
    if (!this.options.getReadinessData) {
      return {
        status: "ready",
        operationalStatus: "degraded",
        checkedAt: new Date().toISOString(),
        checks: [],
        resources: this.getUnavailableResourceSignals(),
      };
    }

    try {
      return await this.options.getReadinessData();
    } catch (error) {
      return {
        status: "not_ready",
        operationalStatus: "degraded",
        checkedAt: new Date().toISOString(),
        checks: [
          {
            name: "runtime-readiness",
            status: "unhealthy",
            message: getErrorMessage(error),
          },
        ],
        resources: this.getUnavailableResourceSignals(),
      };
    }
  }

  private getUnavailableResourceSignals(): RuntimeReadiness["resources"] {
    const memory = process.memoryUsage();
    return {
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
      },
      fileDescriptors: null,
      processes: { total: null, zombies: null },
      queue: null,
      projection: {
        initialized: false,
        trackedRoots: 0,
        openCircuits: [],
      },
      worker: {
        total: 0,
        active: 0,
        stale: 0,
        latestHeartbeatAgeMs: null,
      },
    };
  }

  private async handleDynamicRoute(
    c: HonoContext,
    opts: AppOptions,
  ): Promise<Response | null> {
    if (!opts.healthEndpoint) {
      return null;
    }

    const requestMethod = c.req.method.toUpperCase();
    const requestPath = c.req.path;

    const handlerRoutes = this.routes.filter(
      (route): route is RegisteredHandlerHttpRoute =>
        route.kind === "handler" && route.method === requestMethod,
    );
    const handlerRoute =
      handlerRoutes.find(
        (route) => route.match === "exact" && route.fullPath === requestPath,
      ) ??
      handlerRoutes
        .filter(
          (route) =>
            route.match === "prefix" &&
            (requestPath === route.fullPath ||
              requestPath.startsWith(`${route.fullPath.replace(/\/$/, "")}/`)),
        )
        .sort((left, right) => right.fullPath.length - left.fullPath.length)[0];
    if (handlerRoute) {
      if (handlerRoute.sharedHostAdmission === "deny") {
        return c.text("Unauthorized", 401);
      }
      return handlerRoute.handler(c.req.raw);
    }

    const toolRoute = this.routes.find(
      (route): route is RegisteredToolHttpRoute =>
        route.kind === "tool" &&
        route.fullPath === requestPath &&
        route.method === requestMethod,
    );
    if (toolRoute) {
      if (toolRoute.sharedHostAdmission === "deny") {
        return c.text("Unauthorized", 401);
      }
      if (!this.options.messageBus) {
        return c.text("HTTP tool route unavailable", 500);
      }
      return createApiRouteHandler(
        {
          pluginId: toolRoute.ownerPluginId,
          fullPath: toolRoute.fullPath,
          definition: toolRoute.definition,
        },
        this.options.messageBus,
      )(c);
    }

    return null;
  }

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
    if (!isPathContained(filePath, this.options.sharedImagesDir)) return null;

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
      if (!isPathContained(indexPath, distDir)) {
        await next();
        return;
      }

      const indexFile = Bun.file(indexPath);
      if (await indexFile.exists()) {
        return c.html(await indexFile.text());
      }
      const htmlPath = resolve(distDir, `.${path}.html`);
      if (isPathContained(htmlPath, distDir)) {
        const htmlFile = Bun.file(htmlPath);
        if (await htmlFile.exists()) {
          return c.html(await htmlFile.text());
        }
      }

      await next();
    };
  }
}
