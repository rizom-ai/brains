import type { Plugin } from "@brains/plugins";
import {
  personalSitePlugin,
  PersonalLayout,
  routes,
} from "@brains/layout-personal";
import type { SitePackage } from "@brains/app";

/**
 * mylittlephoney site package — personal layout + blog-focused labeling.
 *
 * Provides the structure for the mylittlephoney site.
 * Pair it with `@brains/theme-mylittlephoney` for the candy-pink styling.
 */
const site: SitePackage = {
  layouts: {
    default: PersonalLayout,
  },
  routes,
  plugin: (config?: Record<string, unknown>): Plugin =>
    personalSitePlugin(config ?? {}),
  entityDisplay: {
    post: { label: "Post" },
    series: {
      label: "Series",
      navigation: { show: false },
    },
  },
};

export default site;
