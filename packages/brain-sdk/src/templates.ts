/**
 * Rich rendering, for a package whose presentation the family fields cannot
 * express.
 *
 * Outside the patch-stable contract: pin an exact version before reaching for
 * it. What is here builds and describes a template. What used to be here and
 * is not any more ran a site build — a `SiteBuilder`, its options and its
 * result, and the registry a host keeps of view templates. Rendering a
 * template never needed them, and no package in this repository imported one.
 */

export {
  createTemplate,
  createTypedComponent,
  TemplateSchema,
  ViewTemplateSchema,
} from "@brains/templates";

export type {
  Template,
  TemplateInput,
  ComponentType,
  RuntimeScript,
  ViewTemplate,
  WebRenderer,
  OutputFormat,
} from "@brains/templates";
