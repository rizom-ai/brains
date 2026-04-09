import type {
  Plugin,
  RouteDefinitionInput,
  EntityDisplayEntry,
} from "@brains/plugins";
import { z } from "@brains/utils";

/**
 * A site package bundles everything the site-builder needs for
 * site structure:
 * - Page structure (layout components)
 * - Hand-written routes (home, about, etc.)
 * - Data layer (site plugin with templates + datasources)
 * - Display metadata per entity type (labels, navigation, pagination)
 *
 * Themes are resolved separately by the resolver. A brain chooses a
 * site package and a theme independently, even though both choices are
 * colocated under `site:` in brain.yaml.
 *
 * @example
 * ```ts
 * import { personalSitePlugin, PersonalLayout, routes } from "@brains/site-personal";
 *
 * const site: SitePackage = {
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

export interface SitePackageOverrides {
  layouts?: Record<string, unknown>;
  routes?: RouteDefinitionInput[];
  plugin?: SitePackage["plugin"];
  entityDisplay?: Record<string, EntityDisplayEntry>;
  staticAssets?: Record<string, string>;
}

function mergeRoutes(
  baseRoutes: RouteDefinitionInput[],
  overrideRoutes: RouteDefinitionInput[] = [],
): RouteDefinitionInput[] {
  const mergedRoutes = [...baseRoutes];
  const indexByKey = new Map<string, number>();

  for (const [index, route] of mergedRoutes.entries()) {
    indexByKey.set(route.id, index);
  }

  for (const route of overrideRoutes) {
    const key = route.id;
    const existingIndex = indexByKey.get(key);

    if (existingIndex !== undefined) {
      mergedRoutes[existingIndex] = route;
      continue;
    }

    indexByKey.set(key, mergedRoutes.length);
    mergedRoutes.push(route);
  }

  return mergedRoutes;
}

export function extendSite(
  baseSite: SitePackage,
  overrides: SitePackageOverrides = {},
): SitePackage {
  const {
    layouts: overrideLayouts = {},
    entityDisplay: overrideEntityDisplay = {},
    staticAssets: overrideStaticAssets = {},
    plugin = baseSite.plugin,
  } = overrides;

  const staticAssets = {
    ...(baseSite.staticAssets ?? {}),
    ...overrideStaticAssets,
  };

  return {
    layouts: {
      ...baseSite.layouts,
      ...overrideLayouts,
    },
    routes: mergeRoutes(baseSite.routes, overrides.routes),
    plugin,
    entityDisplay: {
      ...baseSite.entityDisplay,
      ...overrideEntityDisplay,
    },
    ...(Object.keys(staticAssets).length > 0 ? { staticAssets } : {}),
  };
}

export const themeCssSchema = z.string();

export const sitePackageSchema = z.object({
  layouts: z.record(z.unknown()),
  routes: z.array(z.custom<RouteDefinitionInput>(() => true)),
  plugin: z.custom<SitePackage["plugin"]>(
    (value) => typeof value === "function",
  ),
  entityDisplay: z.record(z.custom<EntityDisplayEntry>(() => true)),
  staticAssets: z.record(z.string()).optional(),
});
