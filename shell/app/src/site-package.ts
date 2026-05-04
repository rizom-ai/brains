import type { Plugin } from "@brains/plugins";
import {
  extendSite,
  sitePackageSchema as baseSitePackageSchema,
  themeCssSchema,
  type SitePackage as BaseSitePackage,
  type SitePackageOverrides as BaseSitePackageOverrides,
} from "@brains/site-composition";
import { z } from "@brains/utils";

export { extendSite, themeCssSchema };

export type SitePackage<TPluginConfig = Record<string, unknown>> =
  BaseSitePackage<TPluginConfig, Plugin>;

export type SitePackageOverrides<TPluginConfig = Record<string, unknown>> =
  BaseSitePackageOverrides<TPluginConfig, Plugin>;

export type ConventionalSiteOverrides<TPluginConfig = Record<string, unknown>> =
  BaseSitePackageOverrides<TPluginConfig, Plugin> & {
    pluginConfig?: TPluginConfig;
  };

export const sitePackageSchema = z.custom<SitePackage>(
  (value) => baseSitePackageSchema.safeParse(value).success,
);
