import type { Plugin, RouteDefinitionInput } from "@brains/plugins";
import type { EntityRouteEntry } from "./brain-definition";

/**
 * A site package bundles everything the site-builder needs:
 * - Visual identity (theme CSS)
 * - Page structure (layout component)
 * - URL patterns (routes)
 * - Data layer (site plugin with templates + datasources)
 * - Content naming (entity route config)
 *
 * Site packages compose reusable layouts with a specific theme
 * to create a complete site identity.
 *
 * @example
 * ```ts
 * import { personalSitePlugin, PersonalLayout, routes } from "@brains/layout-personal";
 * import { composeTheme } from "@brains/theme-base";
 * import themeCSS from "./theme.css" with { type: "text" };
 *
 * const site: SitePackage = {
 *   theme: composeTheme(themeCSS),
 *   layout: PersonalLayout,
 *   routes,
 *   plugin: personalSitePlugin,
 *   entityRouteConfig: {
 *     post: { label: "Post" },
 *   },
 * };
 *
 * export default site;
 * ```
 */
export interface SitePackage {
  /** Composed theme CSS string (theme-base + site-specific overrides) */
  theme: string;

  /** Default page layout component — opaque to app, typed as LayoutComponent by site-builder */
  layout: unknown;

  /** Route definitions for the site */
  routes: RouteDefinitionInput[];

  /** Site plugin factory (registers templates, datasources, schema extensions) */
  plugin: (config?: Record<string, unknown>) => Plugin;

  /** Entity route config — controls what things are called and their URL patterns */
  entityRouteConfig: Record<string, EntityRouteEntry>;
}
