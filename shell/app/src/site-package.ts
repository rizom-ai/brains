import type { Plugin } from "@brains/plugins";
import {
  createSiteContentTemplates,
  extendSite,
  sectionGroupToTemplates,
  sitePackageSchema as baseSitePackageSchema,
  themeCssSchema,
  type SitePackage as BaseSitePackage,
  type SitePackageOverrides as BaseSitePackageOverrides,
} from "@brains/site-composition";
import type { SiteSectionGroup } from "@rizom/site";
import { siteDefinitionOverridesSchema } from "@rizom/site";
import { isPlainRecord } from "@brains/utils/predicates";
import { z } from "@brains/utils/zod";

export {
  createSiteContentTemplates,
  extendSite,
  sectionGroupToTemplates,
  themeCssSchema,
};
export type { SiteContentDefinition } from "@brains/site-composition";
export type { SiteSectionGroup };

export type SitePackage<TPluginConfig = Record<string, unknown>> =
  BaseSitePackage<TPluginConfig, Plugin>;

export type SitePackageOverrides<TPluginConfig = Record<string, unknown>> =
  BaseSitePackageOverrides<TPluginConfig, Plugin>;

export type ConventionalSiteOverrides<TPluginConfig = Record<string, unknown>> =
  BaseSitePackageOverrides<TPluginConfig, Plugin> & {
    pluginConfig?: TPluginConfig;
  };

export const sitePackageSchema: z.ZodType<SitePackage> = z.custom<SitePackage>(
  (value) => baseSitePackageSchema.safeParse(value).success,
);

/**
 * A conventional `src/site.tsx` default export, minus its `pluginConfig`.
 * Authored TypeScript compiled by the app, so the object arriving here is
 * only as trustworthy as the file on disk — validated rather than assumed.
 */
export const conventionalSiteOverridesSchema: z.ZodType<ConventionalSiteOverrides> =
  z.custom<ConventionalSiteOverrides>((value) => {
    if (!isPlainRecord(value)) return false;
    const { plugin, ...site } = value;
    if (plugin !== undefined && typeof plugin !== "function") return false;
    return siteDefinitionOverridesSchema.safeParse(site).success;
  });
