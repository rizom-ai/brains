import { createServer, type Server } from "http";
import { mkdir, lstat, readFile, writeFile } from "fs/promises";
import { dirname, extname, join, resolve, sep } from "path";
import { posix } from "path";
import {
  renderMediaTemplateHtml,
  type MediaTemplateFormat,
} from "./media-template-renderer";
import type { SiteViewTemplate } from "./site-view-template";
import type { SiteBuilderOptions } from "../types/site-builder-types";
import type { SiteImageRendererService } from "@brains/site-engine";

export interface WriteMediaRenderPageOptions {
  outputDir: string;
  mediaPath: string;
  template: SiteViewTemplate;
  format: MediaTemplateFormat;
  content: unknown;
  siteConfig: Pick<SiteBuilderOptions["siteConfig"], "title" | "themeMode">;
  imageBuildService?: SiteImageRendererService | null | undefined;
}

export interface WriteMediaRenderPageResult {
  urlPath: string;
  filePath: string;
}

export async function writeMediaRenderPage(
  options: WriteMediaRenderPageOptions,
): Promise<WriteMediaRenderPageResult> {
  const urlPath = normalizeMediaPath(options.mediaPath);
  const filePath = getMediaPageFilePath(options.outputDir, urlPath);
  const html = renderMediaTemplateHtml({
    template: options.template,
    format: options.format,
    content: options.content,
    siteConfig: options.siteConfig,
    imageBuildService: options.imageBuildService,
  });

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, html, "utf-8");

  return { urlPath, filePath };
}

export interface StaticRenderServer {
  baseUrl: string;
  urlFor: (pathname: string) => string;
  close: () => Promise<void>;
}

export interface StartStaticRenderServerOptions {
  rootDir: string;
  host?: string;
}

export async function startStaticRenderServer(
  options: StartStaticRenderServerOptions,
): Promise<StaticRenderServer> {
  const rootDir = resolve(options.rootDir);
  const host = options.host ?? "127.0.0.1";

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", `http://${host}`);
      const pathname = decodeURIComponent(requestUrl.pathname);

      if (containsTraversal(pathname)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const requestedPath = pathname.startsWith("/")
        ? pathname.slice(1)
        : pathname;
      const resolvedPath = resolve(rootDir, requestedPath);

      if (!isWithinRoot(rootDir, resolvedPath)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const filePath = await resolveServableFile(resolvedPath);
      if (!filePath || !isWithinRoot(rootDir, filePath)) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": getContentType(filePath) });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  await listen(server, host);
  const port = getServerPort(server);
  const baseUrl = `http://${host}:${port}`;

  return {
    baseUrl,
    urlFor: (pathname: string): string =>
      `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`,
    close: () => closeServer(server),
  };
}

function normalizeMediaPath(mediaPath: string): string {
  if (!mediaPath.startsWith("/_media/")) {
    throw new Error("Media render paths must start with /_media/");
  }

  const segments = mediaPath.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    throw new Error("Media render path cannot contain traversal");
  }

  const normalized = posix.normalize(mediaPath);
  if (!normalized.startsWith("/_media/")) {
    throw new Error("Media render path cannot contain traversal");
  }

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function getMediaPageFilePath(outputDir: string, urlPath: string): string {
  const rootDir = resolve(outputDir);
  const relativePath = urlPath.slice(1);
  const filePath = resolve(rootDir, relativePath, "index.html");

  if (!isWithinRoot(rootDir, filePath)) {
    throw new Error("Media render path cannot contain traversal");
  }

  return filePath;
}

function containsTraversal(pathname: string): boolean {
  return pathname.split("/").some((segment) => segment === "..");
}

function isWithinRoot(rootDir: string, filePath: string): boolean {
  const normalizedRoot = rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`;
  return filePath === rootDir || filePath.startsWith(normalizedRoot);
}

async function resolveServableFile(
  resolvedPath: string,
): Promise<string | null> {
  try {
    // Refuse symlinks outright: even if the symlink target is currently within
    // rootDir, the link can be repointed later, and the caller's downstream
    // isWithinRoot check only validates the lexical path, not the resolved
    // inode. lstat avoids the symlink-follow that `stat` would do.
    const lstats = await lstat(resolvedPath);
    if (lstats.isSymbolicLink()) {
      return null;
    }
    if (lstats.isDirectory()) {
      const indexPath = join(resolvedPath, "index.html");
      const indexStats = await lstat(indexPath).catch(() => null);
      if (!indexStats || indexStats.isSymbolicLink()) return null;
      return indexStats.isFile() ? indexPath : null;
    }
    if (lstats.isFile()) {
      return resolvedPath;
    }
    return null;
  } catch {
    return null;
  }
}

function getContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function listen(server: Server, host: string): Promise<void> {
  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolveListen();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, host);
  });
}

function getServerPort(server: Server): number {
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Static render server did not bind to a TCP port");
  }

  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });
}
