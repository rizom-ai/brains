export { ViewRegistry } from "./viewRegistry";
export { RouteRegistry } from "./routeRegistry";
export { ViewTemplateRegistry } from "./viewTemplateRegistry";

// Export types
export type {
  RouteDefinition,
  SectionDefinition,
  ViewTemplate,
  OutputFormat,
  WebRenderer,
  SiteBuilderOptions,
  BuildResult,
  ContentGenerationRequest,
  RouteRegistry as IRouteRegistry,
  ViewTemplateRegistry as IViewTemplateRegistry,
  ViewRegistry as IViewRegistry,
  SiteBuilder,
  SiteContentEntityType,
} from "./types";

export {
  RouteDefinitionSchema,
  SectionDefinitionSchema,
  ViewTemplateSchema,
  SiteBuilderOptionsSchema,
  BuildResultSchema,
  ContentGenerationRequestSchema,
  SiteContentEntityTypeSchema,
} from "./types";

// Export error classes
export {
  TemplateNotFoundError,
  RouteValidationError,
  RendererError,
  ViewConfigError,
  RouteNotFoundError,
  ViewTemplateRegistrationError,
  ViewRouteRegistrationError,
} from "./errors";
