// Site builder plugin - provides static site generation capabilities
export { SiteBuilderPlugin, siteBuilderPlugin } from "./plugin";
export { RouteRegistry, ViewTemplateRegistry } from "@brains/view-registry";
export { builtInTemplates } from "./view-template-schemas";
export { SiteBuilder } from "./site-builder";
export type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  StaticSiteBuilderFactory,
  BuildContext,
} from "./static-site-builder";
export { createPreactBuilder } from "./preact-builder";

// Export site content types and schemas
export type { SiteContentPreview, SiteContentProduction } from "./types";
export { siteContentPreviewSchema, siteContentProductionSchema } from "./types";
