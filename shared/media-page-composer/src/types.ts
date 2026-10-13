import type { MediaFormat, ViewTemplate } from "@brains/plugins";
import type { SiteImageRendererService } from "@brains/site-engine";

export interface MediaSiteConfig {
  title: string;
  themeMode?: "light" | "dark" | undefined;
}

export interface RenderMediaTemplateHtmlOptions {
  template: ViewTemplate;
  format: MediaFormat;
  content: unknown;
  siteConfig: MediaSiteConfig;
  imageBuildService?: SiteImageRendererService | null | undefined;
  noindex?: boolean;
}

export interface WriteMediaRenderPageOptions {
  outputDir: string;
  mediaPath: string;
  template: ViewTemplate;
  format: MediaFormat;
  content: unknown;
  siteConfig: MediaSiteConfig;
  imageBuildService?: SiteImageRendererService | null | undefined;
  themeCSS: string;
}

export interface WriteMediaRenderPageResult {
  urlPath: string;
  filePath: string;
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
