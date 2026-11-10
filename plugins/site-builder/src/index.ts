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

// Export the staging payload type for plugins that write into a build
export type { SiteBuildStagingPayload } from "./types/job-types";
