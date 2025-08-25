export { ViewRegistry } from "./view-registry";
export { RouteRegistry } from "./route-registry";
export { ViewTemplateRegistry } from "./view-template-registry";

// Export types
export type {
  RouteDefinition,
  SectionDefinition,
  ViewTemplate,
  OutputFormat,
  WebRenderer,
  SiteBuilderOptions,
  BuildResult,
  RouteRegistry as IRouteRegistry,
  ViewTemplateRegistry as IViewTemplateRegistry,
  ViewRegistry as IViewRegistry,
  SiteBuilder,
  SiteContentEntityType,
  ComponentType,
} from "./types";

export {
  RouteDefinitionSchema,
  SectionDefinitionSchema,
  ViewTemplateSchema,
  SiteBuilderOptionsSchema,
  BuildResultSchema,
  SiteContentEntityTypeSchema,
  TemplateSchema,
} from "./types";
