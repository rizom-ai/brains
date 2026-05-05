import type { RouteDefinition, SiteLayoutInfo } from "@brains/site-composition";
import type { LayoutComponent, LayoutSlots } from "./layout-contracts";
import type { Logger } from "@brains/utils";
import type { CSSProcessor } from "./css-processor";
import type { RouteScriptTemplate } from "./route-scripts";
import type { SiteImageRendererService } from "./site-image-contracts";

/** Build context passed to static site renderers. */
export interface SiteBuildContext<
  TViewTemplate extends RouteScriptTemplate = RouteScriptTemplate,
> {
  routes: RouteDefinition[];
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
  getViewTemplate: (name: string) => TViewTemplate | undefined;
  layouts: Record<string, LayoutComponent>;
  getSiteLayoutInfo: () => Promise<SiteLayoutInfo>;
  themeCSS?: string;
  /** Optional UI slot registry for plugin-registered components. */
  slots?: LayoutSlots;
  /** Head scripts registered by other plugins. */
  headScripts?: string[] | undefined;
  /** Static assets to write into the output directory at build time. */
  staticAssets?: Record<string, string> | undefined;
  /** Pre-resolved optimized images for the build. */
  imageBuildService?: SiteImageRendererService;
}

/** Interface for static site renderers. */
export interface StaticSiteBuilder<
  TContext extends SiteBuildContext = SiteBuildContext,
> {
  build(
    context: TContext,
    onProgress: (message: string) => void,
  ): Promise<void>;
  clean(): Promise<void>;
}

/** Options for creating a static site renderer. */
export interface StaticSiteBuilderOptions {
  logger: Logger;
  workingDir: string;
  outputDir: string;
  cssProcessor?: CSSProcessor;
}

/** Factory function type for static site renderers. */
export type StaticSiteBuilderFactory<
  TBuilder extends StaticSiteBuilder = StaticSiteBuilder,
> = (options: StaticSiteBuilderOptions) => TBuilder;
