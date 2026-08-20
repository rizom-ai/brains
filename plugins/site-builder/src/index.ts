// Site builder plugin - provides static site generation capabilities
export { SiteBuilderPlugin, siteBuilderPlugin } from "./plugin";
export { SiteBuilder } from "./lib/site-builder";
export type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  StaticSiteBuilderFactory,
  BuildContext,
} from "./lib/static-site-builder";
export { createReactBuilder } from "./lib/react-builder";

// Export event payload types for plugins that subscribe to build events
export type {
  SiteBuildCompletedPayload,
  SiteBuildStagingPayload,
} from "./types/job-types";
