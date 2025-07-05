import type { Logger } from "@brains/utils";
import type { PluginContext } from "@brains/plugin-utils";
import type { RouteDefinition, ViewTemplate } from "@brains/view-registry";
import type { CSSProcessor } from "./css/css-processor";

/**
 * Build context passed to static site builders
 */
export interface BuildContext {
  routes: RouteDefinition[];
  pluginContext: PluginContext;
  siteConfig: {
    title: string;
    description: string;
    url?: string;
  };
  getContent: (route: RouteDefinition, section: RouteDefinition["sections"][0]) => Promise<unknown>;
  getViewTemplate: (name: string) => ViewTemplate | undefined;
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
