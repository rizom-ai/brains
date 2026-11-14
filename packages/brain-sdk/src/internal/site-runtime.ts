/**
 * Internal, first-party only: what a first-party site registers for the
 * brain beside its structural definition, in place of the runtime plugin a
 * site package embedded. `withSiteRuntime(site, { id, config, templates,
 * dataSources })` carries its templates, as `createTemplate` makes them, and
 * its data sources, both read with the site's config: its `entityDisplay`
 * and the brain's site settings. A data source reaches the build's entity
 * reads, the brain's URLs and web routes, requests under the site's id and
 * its logger through `siteDataSourceRuntime(context)`. It re-exports
 * `defineDataSource` from a module that carries no runtime, for a site
 * that bundles its declarations, with `createTemplate`, `renderedLinkFields`
 * and `findRouteByRole` from modules that carry none either. No public
 * entry exports this module; a public site declares `dataSources`.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-site-runtime).
 */

export {
  createTemplate,
  defineDataSource,
  findRouteByRole,
  renderedLinkFields,
  siteDataSourceRuntime,
  withSiteRuntime,
  type DataSourceDefinition,
  type SiteDataSourceRuntime,
  type SiteRuntimeDeclaration,
  type Template,
} from "@brains/plugins/site-declaration";
