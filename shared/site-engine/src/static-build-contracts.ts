import type { Logger } from "@brains/utils/logger";
import type { ProgressNotification } from "@brains/utils/progress";
import type { LayoutComponent, LayoutSlots } from "./layout-contracts";
import type { CSSProcessor } from "./css-processor";
import type { PreparedSiteEnvelope } from "./prepared-site-build";
import type { PreparedRouteSource } from "./prepared-route-source";

/**
 * Renderer context: the build's serializable fields, its pages as they are
 * prepared, and renderer-only component bindings. No content or entity
 * service callbacks are exposed.
 */
export interface SiteBuildContext<TViewTemplate = unknown> {
  preparedBuild: PreparedSiteEnvelope;
  routes: PreparedRouteSource;
  viewTemplates: Record<string, TViewTemplate>;
  layouts: Record<string, LayoutComponent>;
  /** Optional UI slot registry for plugin-registered components. */
  slots?: LayoutSlots;
}

/** Interface for static site renderers. */
export interface StaticSiteBuilder<
  TContext extends SiteBuildContext = SiteBuildContext,
> {
  build(
    context: TContext,
    onProgress: (notification: ProgressNotification) => void,
    signal: AbortSignal,
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
