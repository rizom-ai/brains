/**
 * Internal, first-party only: what a first-party entity definition builds
 * its rendered templates with — `createTemplate`, which types a layout's
 * component by the template's schema and checks its props, and the record
 * schemas a template's data names. No public entry exports this module; a
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
