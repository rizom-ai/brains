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

// Export site content types and schemas
export type { SiteContent } from "./types";
export { siteContentSchema } from "./types";

// Export route types and schemas for other plugins to use
export type {
  RouteDefinition,
  SectionDefinition,
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
