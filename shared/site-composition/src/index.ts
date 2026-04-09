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
export interface SitePackage<TPluginConfig = Record<string, unknown>> {
  /** Layout components keyed by name — at minimum "default" is required */
  layouts: Record<string, unknown>;

  /** Hand-written route definitions (home, about, etc.) */
  routes: RouteDefinitionInput[];

  /** Site plugin factory (registers templates, datasources, schema extensions) */
  plugin: (config?: TPluginConfig) => Plugin;

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

export type SitePackageOverrides<TPluginConfig = Record<string, unknown>> =
  Partial<SitePackage<TPluginConfig>>;

function mergeRoutes(
  baseRoutes: RouteDefinitionInput[],
  overrideRoutes: RouteDefinitionInput[] | undefined,
): RouteDefinitionInput[] {
  if (!overrideRoutes || overrideRoutes.length === 0) {
    return baseRoutes;
  }

  const mergedRoutes = [...baseRoutes];
  const indexByKey = new Map<string, number>();
  for (const [index, route] of mergedRoutes.entries()) {
    indexByKey.set(route.id, index);
  }

  for (const route of overrideRoutes) {
    const existingIndex = indexByKey.get(route.id);
    if (existingIndex !== undefined) {
      mergedRoutes[existingIndex] = route;
      continue;
    }
    indexByKey.set(route.id, mergedRoutes.length);
    mergedRoutes.push(route);
  }

  return mergedRoutes;
}

export function extendSite<TPluginConfig>(
  baseSite: SitePackage<TPluginConfig>,
  overrides: SitePackageOverrides<TPluginConfig> = {},
): SitePackage<TPluginConfig> {
  // Fast path: sites/default extends site-professional with {} on every boot,
  // so returning the base unchanged when no overrides are present avoids
  // per-boot object allocation on the resolver hot path.
  if (Object.keys(overrides).length === 0) {
    return baseSite;
  }

  const {
    layouts: overrideLayouts,
    entityDisplay: overrideEntityDisplay,
    staticAssets: overrideStaticAssets,
    plugin = baseSite.plugin,
  } = overrides;

  const layouts = overrideLayouts
    ? { ...baseSite.layouts, ...overrideLayouts }
    : baseSite.layouts;

  const entityDisplay = overrideEntityDisplay
    ? { ...baseSite.entityDisplay, ...overrideEntityDisplay }
    : baseSite.entityDisplay;

  const staticAssets = overrideStaticAssets
    ? { ...(baseSite.staticAssets ?? {}), ...overrideStaticAssets }
    : baseSite.staticAssets;

  return {
    layouts,
    routes: mergeRoutes(baseSite.routes, overrides.routes),
    plugin,
    entityDisplay,
    ...(staticAssets && Object.keys(staticAssets).length > 0
      ? { staticAssets }
      : {}),
  };
}

export const themeCssSchema = z.string();

// Runtime gate for site packages loaded dynamically from a package ref at
// boot. The full structural type is enforced statically by `SitePackage`
// for in-tree consumers; this only catches dynamic-import shapes.
const routeDefinitionSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough();

const entityDisplayEntrySchema = z
  .object({
    label: z.string().min(1),
  })
  .passthrough();

const sitePackageShapeSchema = z
  .object({
    layouts: z.record(z.unknown()),
    plugin: z.function(),
    routes: z.array(routeDefinitionSchema),
    entityDisplay: z.record(entityDisplayEntrySchema),
    staticAssets: z.record(z.string()).optional(),
  })
  .passthrough();

export const sitePackageSchema = z.custom<SitePackage>(
  (value) => sitePackageShapeSchema.safeParse(value).success,
);
