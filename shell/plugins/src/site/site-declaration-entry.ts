/**
 * What a first-party site declares, without the runtime that registers it:
 * a site that bundles its own copy (one published as a package) imports
 * this entry, and carries no runtime.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-site-runtime).
 */
export {
  withSiteRuntime,
  type SiteRuntimeDeclaration,
} from "./site-declaration";
export {
  siteDataSourceRuntime,
  type SiteDataSourceRuntime,
} from "./site-data-source-runtime";
export { defineDataSource } from "../public/define-data-source";
export type { DataSourceDefinition } from "../entity/entity-definition-contract";
