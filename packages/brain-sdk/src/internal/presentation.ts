/**
 * Internal, first-party only: what a first-party entity definition builds
 * its rendered templates with — `createTemplate`, which types a layout's
 * component by the template's schema and checks its props, the record
 * schemas a template's data names, and the fields a detail view's schema
 * adds for the entity it shows and the links it renders. No public entry exports this module; a
 * public definition's templates are plain declarations.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-entity-runtime).
 */

export {
  contentVisibilitySchema,
  createTemplate,
  type PaginationInfo,
  type Template,
} from "@brains/plugins";
export { paginationInfoSchema } from "@brains/plugins";
export {
  entityViewFields,
  renderedLinkFields,
  viewLinkFields,
  type EntityViewFields,
} from "@brains/plugins";
// What the shared media pages render and attach with.
export type {
  AttachmentProviderMetadata,
  AttachmentResolveRequest,
  ComponentType,
  MediaFormat,
  ViewTemplate,
} from "@brains/plugins";
