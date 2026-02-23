export type { Template, TemplateInput, ComponentType } from "./types";
export { TemplateSchema, createTypedComponent, createTemplate } from "./types";
export { TemplateRegistry } from "./registry";
export { TemplateCapabilities } from "./capabilities";

// Permission (merged from @brains/permission-service)
export {
  PermissionService,
  UserPermissionLevelSchema,
} from "./permission-service";
export type {
  UserPermissionLevel,
  PermissionConfig,
  PermissionRule,
  WithVisibility,
} from "./permission-service";

// Render service (merged from @brains/render-service)
export { RenderService } from "./render-service";
export type {
  ViewTemplate,
  ViewTemplateRegistry,
  WebRenderer,
  OutputFormat,
  SiteBuilder,
  SiteBuilderOptions,
  BuildResult,
  SiteContentEntityType,
} from "./render-types";
export {
  ViewTemplateSchema,
  SiteBuilderOptionsSchema,
  BuildResultSchema,
  SiteContentEntityTypeSchema,
} from "./render-types";
