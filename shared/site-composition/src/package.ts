import { z } from "@brains/utils/zod";
import {
  siteDefinitionSchema,
  type RouteDefinitionInput,
  type SiteContent,
  type SiteDefinition,
  type SiteSectionGroup,
} from "@rizom/site";
import type { SiteCompositionPlugin } from "./plugin";

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
 * import { sitePlugin, SiteLayout, routes } from "./site-components";
 *
 * const site: SitePackage = {
 *   layouts: { default: SiteLayout },
 *   routes,
 *   plugin: sitePlugin,
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
> extends Omit<SiteDefinition, "layouts"> {
  /** Layout values are narrowed to React components by the runtime schema. */
  layouts: Record<string, unknown>;

  /** Optional runtime plugin factory for legacy/internal site integrations. */
  plugin?: ((config?: TPluginConfig) => TPlugin) | undefined;
}

export type SitePackageOverrides<
  TPluginConfig = Record<string, unknown>,
  TPlugin extends SiteCompositionPlugin = SiteCompositionPlugin,
> = Partial<SitePackage<TPluginConfig, TPlugin>>;

function mergeContent(
  baseContent: SiteContent | undefined,
  overrideContent: SiteContent | undefined,
): SiteContent | undefined {
  if (!baseContent) return overrideContent;
  if (!overrideContent) return baseContent;

  const merged: SiteContent = { ...baseContent };
  for (const [namespace, sections] of Object.entries(overrideContent)) {
    merged[namespace] = {
      ...(baseContent[namespace] ?? {}),
      ...sections,
    };
  }
  return merged;
}

function normalizeSections(
  sections: SiteSectionGroup | SiteSectionGroup[] | undefined,
): SiteSectionGroup[] {
  if (!sections) return [];
  return Array.isArray(sections) ? sections : [sections];
}

function mergeSections(
  baseSections: SiteSectionGroup | SiteSectionGroup[] | undefined,
  overrideSections: SiteSectionGroup | SiteSectionGroup[] | undefined,
): SiteSectionGroup[] | undefined {
  const merged = [
    ...normalizeSections(baseSections),
    ...normalizeSections(overrideSections),
  ];
  return merged.length > 0 ? merged : undefined;
}

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
    themeOverride: overrideThemeOverride,
    headScripts: overrideHeadScripts,
  } = overrides;
  const plugin = Object.hasOwn(overrides, "plugin")
    ? overrides.plugin
    : baseSite.plugin;

  const layouts = overrideLayouts
    ? { ...baseSite.layouts, ...overrideLayouts }
    : baseSite.layouts;

  const entityDisplay = overrideEntityDisplay
    ? { ...baseSite.entityDisplay, ...overrideEntityDisplay }
    : baseSite.entityDisplay;

  const staticAssets = overrideStaticAssets
    ? { ...(baseSite.staticAssets ?? {}), ...overrideStaticAssets }
    : baseSite.staticAssets;
  const themeOverride = [baseSite.themeOverride, overrideThemeOverride]
    .filter(Boolean)
    .join("\n\n");
  // Replace, don't concat: a variant's head script bundle supersedes the
  // base's (both include /boot.js — stacking them double-binds #themeToggle).
  const headScripts = overrideHeadScripts ?? baseSite.headScripts ?? [];
  const content = mergeContent(baseSite.content, overrides.content);
  const sections = mergeSections(baseSite.sections, overrides.sections);

  return {
    layouts,
    routes: mergeRoutes(baseSite.routes, overrides.routes),
    ...(plugin ? { plugin } : {}),
    entityDisplay,
    ...(content ? { content } : {}),
    ...(sections ? { sections } : {}),
    ...(themeOverride ? { themeOverride } : {}),
    ...(headScripts.length > 0 ? { headScripts } : {}),
    ...(staticAssets && Object.keys(staticAssets).length > 0
      ? { staticAssets }
      : {}),
  };
}

export const themeCssSchema: z.ZodString = z.string();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Internal packages may still carry an embedded runtime plugin while they are
// migrated to explicit plugin composition. The public structural fields are
// always validated by the canonical @rizom/site schema.
export const sitePackageSchema: z.ZodType<SitePackage> = z.custom<SitePackage>(
  (value) => {
    if (!isRecord(value)) return false;
    const { plugin, ...site } = value;
    if (plugin !== undefined && typeof plugin !== "function") return false;
    return siteDefinitionSchema.safeParse(site).success;
  },
);
