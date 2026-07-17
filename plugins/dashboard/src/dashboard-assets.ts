import type { WebRouteDefinition } from "@brains/plugins";
import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_PALETTE_SCRIPT,
} from "@brains/console-theme";
import { computeContentHash } from "@brains/utils/hash";
import { DASHBOARD_STYLES } from "./render/styles";
import { DASHBOARD_UI_SCRIPT } from "./render/ui-script";
import type { DashboardAssetUrls } from "./render/types";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const DASHBOARD_CLIENT_SCRIPT = [
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_PALETTE_SCRIPT,
  DASHBOARD_UI_SCRIPT,
].join("\n\n");

interface DashboardAsset {
  path: string;
  content: string;
  contentType: string;
  etag: string;
}

function assetBasePath(routePath: string): string {
  const normalized = routePath.replace(/\/+$/, "");
  return `${normalized}/assets`;
}

export class DashboardAssetRegistry {
  private readonly basePath: string;
  private readonly assets = new Map<string, DashboardAsset>();
  private readonly dashboardStylesUrl: string;
  private readonly dashboardScriptUrl: string;

  constructor(routePath: string) {
    this.basePath = assetBasePath(routePath);
    this.dashboardStylesUrl = this.register(
      "dashboard",
      "css",
      "text/css; charset=utf-8",
      DASHBOARD_STYLES,
    );
    this.dashboardScriptUrl = this.register(
      "dashboard",
      "js",
      "text/javascript; charset=utf-8",
      DASHBOARD_CLIENT_SCRIPT,
    );
  }

  createRenderUrls(options: {
    themeCSS?: string | undefined;
    widgetStyles: string[];
    widgetScripts: string[];
  }): DashboardAssetUrls {
    return {
      dashboardStyles: this.dashboardStylesUrl,
      dashboardScript: this.dashboardScriptUrl,
      ...(options.themeCSS !== undefined && {
        themeStyles: this.register(
          "theme",
          "css",
          "text/css; charset=utf-8",
          options.themeCSS,
        ),
      }),
      widgetStyles: Array.from(new Set(options.widgetStyles)).map((styles) =>
        this.register("widget", "css", "text/css; charset=utf-8", styles),
      ),
      widgetScripts: Array.from(new Set(options.widgetScripts)).map((script) =>
        this.register("widget", "js", "text/javascript; charset=utf-8", script),
      ),
    };
  }

  getRoutes(): WebRouteDefinition[] {
    return Array.from(this.assets.values()).map((asset) => ({
      path: asset.path,
      method: "GET",
      public: true,
      handler: (request: Request): Response => {
        const headers = {
          "Cache-Control": IMMUTABLE_CACHE_CONTROL,
          "Content-Type": asset.contentType,
          ETag: asset.etag,
          "X-Content-Type-Options": "nosniff",
        };

        if (request.headers.get("If-None-Match") === asset.etag) {
          return new Response(null, { status: 304, headers });
        }

        return new Response(asset.content, { headers });
      },
    }));
  }

  private register(
    name: "dashboard" | "theme" | "widget",
    extension: "css" | "js",
    contentType: string,
    content: string,
  ): string {
    const hash = computeContentHash(content);
    const path = `${this.basePath}/${name}.${hash}.${extension}`;

    if (!this.assets.has(path)) {
      this.assets.set(path, {
        path,
        content,
        contentType,
        etag: `"${hash}"`,
      });
    }

    return path;
  }
}
