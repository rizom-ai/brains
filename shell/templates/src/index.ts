export type {
  LayoutTemplate,
  NonLayoutTemplate,
  Template,
  TemplateInput,
  ComponentType,
  FormatComponents,
  MediaFormat,
  RuntimeScript,
  TemplateDataSchema,
  TemplateSchemaParser,
} from "./types";
export {
  TemplateSchema,
  createTypedComponent,
  createTemplate,
  renderedLinkFields,
  templateRenderers,
} from "./types";
export { InMemoryTemplateRegistry } from "./registry";
export type { TemplateRegistry } from "./registry";
export { TemplateCapabilities } from "./capabilities";

// Permission (merged from @brains/permission-service)
export {
  PermissionService,
  UserPermissionLevelSchema,
  EntityActionSchema,
  EntityActionRequiredLevelSchema,
  entityActionPolicyRuleSchema,
  entityActionPolicyConfigSchema,
  EntityActionPermissionError,
} from "./permission-service";
export type {
  UserPermissionLevel,
  EntityAction,
  EntityActionRequiredLevel,
  EntityActionPolicyRule,
  EntityActionPolicyRuleInput,
  EntityActionPolicyConfig,
  EntityActionPolicyConfigInput,
  EntityActionPolicyEntry,
  EntityActionPolicy,
  ConfiguredPrincipalSeeds,
  PermissionConfig,
  PermissionRule,
  PermissionRuleInput,
  PermissionLookupContext,
  PermissionServiceOptions,
  WithVisibility,
} from "./permission-service";
export { matchSpaceSelector } from "./space-selector";

// Render service (merged from @brains/render-service)
export { RenderService, toViewTemplate } from "./render-service";
export type {
  ViewTemplate,
  ViewTemplateRegistry,
  WebRenderer,
  ImageRenderer,
  PdfRenderer,
  MediaRenderer,
  Renderer,
  OutputFormat,
  SiteBuilder,
  SiteBuilderOptions,
  BuildResult,
  SiteContentEntityType,
} from "./render-types";
export {
  ViewTemplateSchema,
  OutputFormatSchema,
  SiteBuilderOptionsSchema,
  BuildResultSchema,
  SiteContentEntityTypeSchema,
} from "./render-types";
