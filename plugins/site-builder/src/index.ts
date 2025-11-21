// Site builder plugin - provides static site generation capabilities
export { SiteBuilderPlugin, siteBuilderPlugin } from "./plugin";
export { builtInTemplates } from "./view-template-schemas";
export { SiteBuilder } from "./lib/site-builder";
export type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  StaticSiteBuilderFactory,
  BuildContext,
} from "./lib/static-site-builder";
export { createPreactBuilder } from "./lib/preact-builder";

// Re-export Head component and utilities from ui-library for convenience
export { Head, useHead, HeadProvider } from "@brains/ui-library";
export type { HeadProps } from "@brains/ui-library";

// Export site content types and schemas
export type { SiteContent } from "./types";
export { siteContentSchema } from "./types";

// Export site info types
export type { SiteInfo } from "./types/site-info";
export { SiteInfoSchema } from "./types/site-info";

// Export URL generator for datasources to use
export { EntityUrlGenerator } from "./lib/entity-url-generator";

// Export event payload types for plugins that subscribe to build events
export type { SiteBuildCompletedPayload } from "./types/job-types";

// Export route types and schemas for other plugins to use
export type {
  RouteDefinition,
  SectionDefinition,
  NavigationItem,
  RegisterRoutesPayload,
  UnregisterRoutesPayload,
  ListRoutesPayload,
  GetRoutePayload,
  RouteResponse,
  RouteListResponse,
  SingleRouteResponse,
} from "./types/routes";
export {
  RouteDefinitionSchema,
  SectionDefinitionSchema,
  RegisterRoutesPayloadSchema,
  UnregisterRoutesPayloadSchema,
  ListRoutesPayloadSchema,
  GetRoutePayloadSchema,
} from "./types/routes";
