#!/usr/bin/env bun
/**
 * Standalone static file server — runs as a child process.
 *
 * Serves preview and production sites with clean URLs, cache headers,
 * image fast-path, and 404 handling. Zero brain dependencies.
 *
 * Config is passed via environment variables:
 *   PRODUCTION_DIST_DIR, PREVIEW_DIST_DIR, SHARED_IMAGES_DIR,
 *   PRODUCTION_PORT, PREVIEW_PORT
 */

import { Hono, type Context as HonoContext, type Next as HonoNext } from "hono";
import { serveStatic } from "hono/bun";
import { compress } from "@hono/bun-compress";
import { etag } from "hono/etag";
import { join } from "path";

// ─── Config from environment ───────────────────────────────────────────────

const rawProductionDistDir = process.env["PRODUCTION_DIST_DIR"];
if (!rawProductionDistDir) {
  throw new Error("PRODUCTION_DIST_DIR is required");
}

const productionDistDir: string = rawProductionDistDir;
const previewDistDir = process.env["PREVIEW_DIST_DIR"];
const sharedImagesDir = process.env["SHARED_IMAGES_DIR"] ?? "./dist/images";
const productionPort = Number(process.env["PRODUCTION_PORT"] ?? "8080");
const previewPort = Number(process.env["PREVIEW_PORT"] ?? "4321");

// ─── Shared helpers ────────────────────────────────────────────────────────

/**
 * Serve /images/* directly via Bun.file(), bypassing Hono middleware.
 */
async function serveImageFastPath(req: Request): Promise<Response | null> {
  if (!req.url.includes("/images/")) return null;

  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return null;
  }
  if (!url.pathname.startsWith("/images/")) return null;

  const fileName = url.pathname.replace("/images/", "");
  const file = Bun.file(join(sharedImagesDir, fileName));
  if (!(await file.exists())) return null;

  return new Response(file, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

/**
 * Create an async clean-URL middleware: serves /foo as /foo/index.html or /foo.html
 */
function createCleanUrlMiddleware(distDir: string) {
  return async (c: HonoContext, next: HonoNext): Promise<void | Response> => {
    const path = c.req.path;
    if (path.includes(".") || path === "/") {
      await next();
      return;
    }

    const indexFile = Bun.file(join(distDir, path, "index.html"));
    if (await indexFile.exists()) {
      return c.html(await indexFile.text());
    }
    const htmlFile = Bun.file(join(distDir, path + ".html"));
    if (await htmlFile.exists()) {
      return c.html(await htmlFile.text());
    }

    await next();
  };
}

// ─── Create apps ───────────────────────────────────────────────────────────

function createProductionApp(): Hono {
  const app = new Hono();

  app.use("/*", compress());
  app.use("/*", etag());

  // Production caching: static assets 1yr immutable, HTML 1hr
  app.use("/*", async (c, next) => {
    await next();
    const path = c.req.path;
    if (path.match(/\.(js|css|jpg|jpeg|png|gif|ico|woff|woff2)$/)) {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      c.header("Cache-Control", "public, max-age=3600");
    }
  });

  app.use("/*", createCleanUrlMiddleware(productionDistDir));
  app.use("/*", serveStatic({ root: productionDistDir }));

  app.notFound(async (c) => {
    const notFoundFile = Bun.file(join(productionDistDir, "404.html"));
    if (await notFoundFile.exists()) {
      return c.html(await notFoundFile.text(), 404);
    }
    return c.text("Not Found", 404);
  });

  return app;
}

function createPreviewApp(distDir: string): Hono {
  const app = new Hono();

  app.use("/*", etag());

  // Preview caching: images/fonts cached, everything else revalidates
  app.use("/*", async (c, next) => {
    await next();
    const path = c.req.path;
    if (path.match(/\.(jpg|jpeg|png|gif|ico|webp|svg|woff|woff2)$/)) {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      c.header("Cache-Control", "no-cache");
    }
  });

  app.use("/*", createCleanUrlMiddleware(distDir));
  app.use("/*", serveStatic({ root: distDir }));

  app.notFound(async (c) => {
    const notFoundFile = Bun.file(join(distDir, "404.html"));
    if (await notFoundFile.exists()) {
      return c.html(await notFoundFile.text(), 404);
    }
    return c.text("Not Found", 404);
  });

  return app;
}

// ─── Start servers ─────────────────────────────────────────────────────────

const productionApp = createProductionApp();

Bun.serve({
  port: productionPort,
  fetch: async (req) => {
    const fastResponse = await serveImageFastPath(req);
    if (fastResponse) return fastResponse;
    return productionApp.fetch(req);
  },
});

console.log(
  `Production server listening on http://localhost:${productionPort}`,
);

if (previewDistDir) {
  const previewApp = createPreviewApp(previewDistDir);

  Bun.serve({
    port: previewPort,
    fetch: async (req) => {
      const fastResponse = await serveImageFastPath(req);
      if (fastResponse) return fastResponse;
      return previewApp.fetch(req);
    },
  });

  console.log(`Preview server listening on http://localhost:${previewPort}`);
}

// Signal readiness to parent process
console.log("WEBSERVER_READY");
