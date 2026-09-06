// The brain's own website: routes, templates, and the builds that write them.
import { siteBuilderService } from "./service";

export { siteBuilderService } from "./service";
export type { SiteBuilderState } from "./service";
export { SiteBuilder } from "./lib/site-builder";
export type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  StaticSiteBuilderFactory,
  BuildContext,
} from "./lib/static-site-builder";
export { createReactBuilder } from "./lib/react-builder";

// Event payload types for packages that listen for finished builds.
export type {
  SiteBuildCompletedPayload,
  SiteBuildStagingPayload,
} from "./types/job-types";

/** The site builder as a brain composes it. */
const siteBuilderPackage: ReturnType<typeof siteBuilderService> =
  siteBuilderService();
export default siteBuilderPackage;
