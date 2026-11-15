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

export type SitePackage = BaseSitePackage;

export type SitePackageOverrides = BaseSitePackageOverrides;

/**
 * A conventional `src/site.tsx`: overrides over the brain's site, and the
 * config its carried runtime takes beneath brain.yaml's site settings.
 */
export type ConventionalSiteOverrides = BaseSitePackageOverrides & {
  pluginConfig?: Record<string, unknown>;
};

export const sitePackageSchema: z.ZodCustom<SitePackage, SitePackage> =
  z.custom<SitePackage>(
    (value) => baseSitePackageSchema.safeParse(value).success,
  );

/**
 * A conventional `src/site.tsx` default export, minus its `pluginConfig`.
 * Authored TypeScript compiled by the app, so the object arriving here is
 * only as trustworthy as the file on disk — validated rather than assumed.
 */
export const conventionalSiteOverridesSchema: z.ZodCustom<
  ConventionalSiteOverrides,
  ConventionalSiteOverrides
> = z.custom<ConventionalSiteOverrides>((value) => {
  return (
    isPlainRecord(value) &&
    siteDefinitionOverridesSchema.safeParse(value).success
  );
});
