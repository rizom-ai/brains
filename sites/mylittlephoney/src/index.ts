import type { Plugin } from "@brains/plugins";
import {
  personalSitePlugin,
  PersonalLayout,
  routes,
} from "@brains/layout-personal";
import themeCSS from "@brains/theme-mylittlephoney";
import type { SitePackage } from "@brains/app";

/**
 * mylittlephoney site package — pink unicorn theme + personal layout.
 *
 * Bundles a playful candy-pink visual identity with a clean
 * blog-focused personal layout into a single deployable unit.
 */
const site: SitePackage = {
  theme: themeCSS,
  layouts: {
    default: PersonalLayout,
  },
  routes,
  plugin: (config?: Record<string, unknown>): Plugin =>
    personalSitePlugin(config ?? {}),
  entityRouteConfig: {
    post: { label: "Post" },
  },
};

export default site;
