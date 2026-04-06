import type {
  Plugin,
  RouteDefinitionInput,
  EntityDisplayEntry,
} from "@brains/plugins";

/**
 * A site package bundles everything the site-builder needs:
 * - Visual identity (theme CSS)
 * - Page structure (layout components)
 * - Hand-written routes (home, about, etc.)
 * - Data layer (site plugin with templates + datasources)
 * - Display metadata per entity type (labels, navigation, pagination)
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
 *   layouts: { default: PersonalLayout },
 *   routes,
 *   plugin: personalSitePlugin,
 *   entityDisplay: {
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

  /** Layout components keyed by name — at minimum "default" is required */
  layouts: Record<string, unknown>;

  /** Hand-written route definitions (home, about, etc.) */
  routes: RouteDefinitionInput[];

  /** Site plugin factory (registers templates, datasources, schema extensions) */
  plugin: (config?: Record<string, unknown>) => Plugin;

  /**
   * Display metadata per entity type — label, plural name, layout,
   * pagination, navigation slot. Consulted by the dynamic route
   * generator when producing auto-generated list/detail routes for
   * active entity plugins.
   */
  entityDisplay: Record<string, EntityDisplayEntry>;

  /**
   * Static assets to write into the site output directory at build time.
   *
   * Keys are output paths relative to the output directory (e.g.
   * `/canvases/tree.js`, `/fonts/foo.woff2`). Values are file contents
   * as strings — typically produced by text imports
   * (`import content from "./foo.js" with { type: "text" }`).
   *
   * Use this to ship static files that belong to the site package
   * itself (canvas scripts, fonts, images encoded as base64, etc.)
   * rather than the consuming app's `public/` directory. The
   * site-builder writes them verbatim next to the rendered HTML.
   */
  staticAssets?: Record<string, string>;
}
