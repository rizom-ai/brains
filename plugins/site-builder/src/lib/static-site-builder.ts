import type { ServicePluginContext, ViewTemplate } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { RouteDefinition } from "../types/routes";
import type { CSSProcessor } from "../css/css-processor";
import type { LayoutComponent, LayoutSlots } from "../config";
import type { SiteInfo } from "../types/site-info";

// Re-export SiteInfo type for consumers
export type { SiteInfo } from "../types/site-info";
// Re-export LayoutSlots for consumers
export type { LayoutSlots } from "../config";

/**
 * Build context passed to static site builders
 */
export interface BuildContext {
  routes: RouteDefinition[];
  pluginContext: ServicePluginContext;
  siteConfig: {
    title: string;
    description: string;
    url?: string;
    copyright?: string;
    themeMode?: "light" | "dark";
    analyticsScript?: string;
  };
  getContent: (
    route: RouteDefinition,
    section: RouteDefinition["sections"][0],
  ) => Promise<unknown>;
  getViewTemplate: (name: string) => ViewTemplate | undefined;
  layouts: Record<string, LayoutComponent>;
  getSiteInfo: () => Promise<SiteInfo>;
  themeCSS?: string;
  /** Optional UI slot registry for plugin-registered components */
  slots?: LayoutSlots;
}

/**
 * Interface for static site builders (Preact, React, etc.)
 */
export interface StaticSiteBuilder {
  /**
   * Build all routes
   */
  build(
    context: BuildContext,
    onProgress: (message: string) => void,
  ): Promise<void>;

  /**
   * Clean build artifacts
   */
  clean(): Promise<void>;
}

/**
 * Options for creating a static site builder
 */
export interface StaticSiteBuilderOptions {
  logger: Logger;
  workingDir: string;
  outputDir: string;
  cssProcessor?: CSSProcessor;
}

/**
 * Factory function type for static site builders
 */
export type StaticSiteBuilderFactory = (
  options: StaticSiteBuilderOptions,
) => StaticSiteBuilder;
