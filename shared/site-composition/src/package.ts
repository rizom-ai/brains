import { z } from "@brains/utils/zod";
import {
  siteDefinitionSchema,
  type RouteDefinitionInput,
  type SiteContent,
  type SiteDefinition,
  type SiteSectionGroup,
} from "@rizom/site";
import { isRecord } from "@brains/utils/is-record";
import { attachSiteRuntime, siteRuntimeOf } from "./site-runtime";

/**
 * A site package bundles everything the site-builder needs for
 * site structure:
 * - Page structure (layout components)
 * - Hand-written routes (home, about, etc.)
 * - Data layer (the site's dataSources, or a first-party site's carried runtime)
 * - Display metadata per entity type (labels, navigation, pagination)
 *
 * Themes are resolved separately by the resolver. A brain chooses a
 * site package and a theme independently, even though both choices are
 * colocated under `site:` in brain.yaml.
 *
 * @example
 * ```ts
 * import { SiteLayout, routes } from "./site-components";
 *
 * const site: SitePackage = {
 *   layouts: { default: SiteLayout },
 *   routes,
 *   entityDisplay: {
 *     post: { label: "Post" },
 *   },
 * };
 *
 * export default site;
 * ```
 */
export interface SitePackage extends Omit<SiteDefinition, "layouts"> {
  /** Layout values are narrowed to React components by the runtime schema. */
  layouts: Record<string, unknown>;
}

export type SitePackageOverrides = Partial<SitePackage>;

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

export function extendSite(
  baseSite: SitePackage,
  overrides: SitePackageOverrides = {},
): SitePackage {
  // Fast path: sites/default extends site-professional with {} on every boot,
  // so returning the base unchanged when no overrides are present avoids
  // per-boot object allocation on the resolver hot path.
  if (
    Object.keys(overrides).length === 0 &&
    siteRuntimeOf(overrides) === undefined
  ) {
    return baseSite;
  }

  const {
    layouts: overrideLayouts,
    entityDisplay: overrideEntityDisplay,
    staticAssets: overrideStaticAssets,
    themeOverride: overrideThemeOverride,
    headScripts: overrideHeadScripts,
  } = overrides;

  const layouts = overrideLayouts
    ? { ...baseSite.layouts, ...overrideLayouts }
    : baseSite.layouts;

  // Per type: an override refines the base's display for a type and keeps
  // what it leaves out, so relabelling essays does not drop their other
  // settings.
  const entityDisplay = overrideEntityDisplay
    ? {
        ...baseSite.entityDisplay,
        ...Object.fromEntries(
          Object.entries(overrideEntityDisplay).map(([entityType, display]) => [
            entityType,
            { ...baseSite.entityDisplay[entityType], ...display },
          ]),
        ),
      }
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
  const languages = overrides.languages ?? baseSite.languages;
  const dataSources = [
    ...(baseSite.dataSources ?? []),
    ...(overrides.dataSources ?? []),
  ];

  const extended: SitePackage = {
    layouts,
    routes: mergeRoutes(baseSite.routes, overrides.routes),
    entityDisplay,
    ...(content ? { content } : {}),
    ...(sections ? { sections } : {}),
    ...(themeOverride ? { themeOverride } : {}),
    ...(headScripts.length > 0 ? { headScripts } : {}),
    ...(languages ? { languages } : {}),
    ...(dataSources.length > 0 ? { dataSources } : {}),
    ...(staticAssets && Object.keys(staticAssets).length > 0
      ? { staticAssets }
      : {}),
  };
  // What the base carries for the runtime stays with what extends it.
  const runtime = siteRuntimeOf(overrides) ?? siteRuntimeOf(baseSite);
  return runtime === undefined
    ? extended
    : attachSiteRuntime(extended, runtime);
}

export const themeCssSchema: z.ZodString = z.string();

// A site package is the canonical @rizom/site structure; what a first-party
// site carries for the runtime travels beside it under a key no field names.
export const sitePackageSchema: z.ZodCustom<SitePackage, SitePackage> =
  z.custom<SitePackage>(
    (value) => isRecord(value) && siteDefinitionSchema.safeParse(value).success,
  );
