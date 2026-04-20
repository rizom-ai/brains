import type { SitePackageOverrides as BaseSitePackageOverrides } from "@brains/site-composition";

export {
  extendSite,
  sitePackageSchema,
  themeCssSchema,
} from "@brains/site-composition";
export type {
  SitePackage,
  SitePackageOverrides,
} from "@brains/site-composition";

export type ConventionalSiteOverrides<TPluginConfig = Record<string, unknown>> =
  BaseSitePackageOverrides<TPluginConfig> & {
    pluginConfig?: TPluginConfig;
  };
