// Site builder plugin - provides static site generation capabilities
export { SiteBuilderPlugin, siteBuilderPlugin } from "./plugin";
export { RouteRegistry } from "./route-registry";
export { ViewTemplateRegistry } from "./view-template-registry";
export { builtInTemplates } from "./view-template-schemas";
export { SiteBuilder } from "./site-builder";
export type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  StaticSiteBuilderFactory,
  BuildContext,
} from "./static-site-builder";
export { createPreactBuilder } from "./preact-builder";
