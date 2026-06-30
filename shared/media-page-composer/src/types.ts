import type { VNode } from "preact";
import type { SiteImageRendererService } from "@brains/site-engine";
import type { ZodType } from "@brains/utils/zod-v4";

export type MediaTemplateFormat = "image" | "pdf";

export type MediaPageRenderer = (props: Record<string, unknown>) => VNode;

export type MediaPageContentSchema = ZodType<unknown, unknown>;

export interface MediaPageTemplate {
  name: string;
  schema: MediaPageContentSchema;
  pluginId: string;
  renderers: {
    image?: MediaPageRenderer | string;
    pdf?: MediaPageRenderer | string;
  };
}

export interface MediaSiteConfig {
  title: string;
  themeMode?: "light" | "dark" | undefined;
}

export interface RenderMediaTemplateHtmlOptions {
  template: MediaPageTemplate;
  format: MediaTemplateFormat;
  content: unknown;
  siteConfig: MediaSiteConfig;
  imageBuildService?: SiteImageRendererService | null | undefined;
  noindex?: boolean;
}

export interface WriteMediaRenderPageOptions {
  outputDir: string;
  mediaPath: string;
  template: MediaPageTemplate;
  format: MediaTemplateFormat;
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
