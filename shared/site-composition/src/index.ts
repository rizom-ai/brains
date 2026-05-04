import { z } from "@brains/utils";

/** Minimal plugin shape needed by site packages. */
export interface SiteCompositionPlugin {
  readonly id: string;
  readonly version: string;
  readonly type: "core" | "entity" | "service" | "interface";
  readonly packageName: string;
  readonly description?: string | undefined;
  readonly dependencies?: string[] | undefined;
  ready?(): Promise<void>;
  shutdown?(): Promise<void>;
  requiresDaemonStartup?(): boolean;
}

/** Section definition schema for site routes. */
export const SectionDefinitionSchema = z.object({
  id: z.string(),
  template: z.string(),
  content: z.unknown().optional(),
  dataQuery: z
    .object({
      entityType: z.string().optional(),
      template: z.string().optional(),
      query: z
        .object({
          id: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .optional(),
  order: z.number().optional(),
});

/** Navigation slot types. */
export const NavigationSlots = ["primary", "secondary"] as const;
export type NavigationSlot = (typeof NavigationSlots)[number];

/** Display and behavior metadata for an entity type. */
export interface EntityDisplayEntry {
  label: string;
  pluralName?: string;
  /** Layout name for this entity type's generated routes (defaults to "default") */
  layout?: string;
  /** Enable pagination for list pages */
  paginate?: boolean;
  /** Items per page (default: 10) */
  pageSize?: number;
  navigation?: {
    show?: boolean;
    slot?: NavigationSlot;
    priority?: number;
  };
}

/** Navigation metadata schema for route definitions. */
export const NavigationMetadataSchema = z
  .object({
    show: z.boolean().default(false),
    label: z.string().optional(),
    slot: z.enum(NavigationSlots).default("primary"),
    priority: z.number().min(0).max(100).default(50),
  })
  .optional();

/** Route definition schema. */
export const RouteDefinitionSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string().default(""),
  description: z.string().default(""),
  sections: z.array(SectionDefinitionSchema).default([]),
  layout: z.string().default("default"),
  fullscreen: z.boolean().optional(),
  pluginId: z.string().optional(),
  sourceEntityType: z.string().optional(),
  external: z.boolean().optional(),
  navigation: NavigationMetadataSchema,
});

export type SectionDefinition = z.infer<typeof SectionDefinitionSchema>;
export type RouteDefinition = z.infer<typeof RouteDefinitionSchema>;
export type RouteDefinitionInput = z.input<typeof RouteDefinitionSchema>;
export type NavigationMetadata = z.infer<typeof NavigationMetadataSchema>;

/** Message payload schemas for route operations. */
export const RegisterRoutesPayloadSchema = z.object({
  routes: z.array(RouteDefinitionSchema),
  pluginId: z.string(),
});

export const UnregisterRoutesPayloadSchema = z.object({
  paths: z.array(z.string()).optional(),
  pluginId: z.string().optional(),
});

export const ListRoutesPayloadSchema = z.object({
  pluginId: z.string().optional(),
});

export const GetRoutePayloadSchema = z.object({
  path: z.string(),
});

export type RegisterRoutesPayload = z.infer<typeof RegisterRoutesPayloadSchema>;
export type UnregisterRoutesPayload = z.infer<
  typeof UnregisterRoutesPayloadSchema
>;
export type ListRoutesPayload = z.infer<typeof ListRoutesPayloadSchema>;
export type GetRoutePayload = z.infer<typeof GetRoutePayloadSchema>;

export interface RouteOperationResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ListRoutesResponse {
  routes: RouteDefinition[];
}

export interface GetRouteResponse {
  route?: RouteDefinition | undefined;
}

/** Navigation item interface for extracted navigation data. */
export interface NavigationItem {
  label: string;
  href: string;
  priority: number;
}

export const SITE_METADATA_GET_CHANNEL = "site:metadata:get";
export const SITE_METADATA_UPDATED_CHANNEL = "site:metadata:updated";

export const siteMetadataCTASchema = z.object({
  heading: z.string().describe("Main CTA heading text"),
  buttonText: z.string().describe("Call-to-action button text"),
  buttonLink: z.string().describe("URL or anchor for the CTA button"),
});

/** Plain site metadata consumed by site renderers. */
export const siteMetadataSchema = z.object({
  title: z.string().describe("The site's title"),
  description: z.string().describe("The site's description"),
  url: z.string().optional().describe("Canonical site URL"),
  copyright: z.string().optional().describe("Copyright notice text"),
  logo: z
    .boolean()
    .optional()
    .describe("Whether to display logo instead of title text in header"),
  themeMode: z
    .enum(["light", "dark"])
    .optional()
    .describe("Default theme mode"),
  analyticsScript: z.string().optional().describe("Analytics script HTML"),
  cta: siteMetadataCTASchema
    .optional()
    .describe("Call-to-action configuration"),
});

export type SiteMetadata = z.infer<typeof siteMetadataSchema>;
export type SiteMetadataCTA = z.infer<typeof siteMetadataCTASchema>;

const navigationItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  priority: z.number(),
});

const socialLinkSchema = z.object({
  platform: z
    .enum(["github", "instagram", "linkedin", "email", "website"])
    .describe("Social media platform"),
  url: z.string().describe("Profile or contact URL"),
  label: z.string().optional().describe("Optional display label"),
});

/** Complete site information passed to layout components. */
export const siteLayoutInfoSchema = siteMetadataSchema.extend({
  navigation: z.object({
    primary: z.array(navigationItemSchema),
    secondary: z.array(navigationItemSchema),
  }),
  copyright: z.string(),
  socialLinks: z
    .array(socialLinkSchema)
    .optional()
    .describe("Social media links from profile metadata"),
});

export type SiteLayoutInfo = z.infer<typeof siteLayoutInfoSchema>;

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
export interface SitePackage<
  TPluginConfig = Record<string, unknown>,
  TPlugin extends SiteCompositionPlugin = SiteCompositionPlugin,
> {
  /** Layout components keyed by name — at minimum "default" is required */
  layouts: Record<string, unknown>;

  /** Hand-written route definitions (home, about, etc.) */
  routes: RouteDefinitionInput[];

  /** Site plugin factory (registers templates, datasources, schema extensions) */
  plugin: (config?: TPluginConfig) => TPlugin;

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

export type SitePackageOverrides<
  TPluginConfig = Record<string, unknown>,
  TPlugin extends SiteCompositionPlugin = SiteCompositionPlugin,
> = Partial<SitePackage<TPluginConfig, TPlugin>>;

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

export function extendSite<
  TPluginConfig,
  TPlugin extends SiteCompositionPlugin = SiteCompositionPlugin,
>(
  baseSite: SitePackage<TPluginConfig, TPlugin>,
  overrides: SitePackageOverrides<TPluginConfig, TPlugin> = {},
): SitePackage<TPluginConfig, TPlugin> {
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
const sitePackageRouteShapeSchema = z
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
    routes: z.array(sitePackageRouteShapeSchema),
    entityDisplay: z.record(entityDisplayEntrySchema),
    staticAssets: z.record(z.string()).optional(),
  })
  .passthrough();

export const sitePackageSchema = z.custom<SitePackage>(
  (value) => sitePackageShapeSchema.safeParse(value).success,
);
