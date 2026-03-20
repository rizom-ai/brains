import type { Plugin } from "@brains/plugins";
import {
  defaultSitePlugin,
  DefaultLayout,
  MinimalLayout,
  routes,
} from "@brains/default-site-content";
import themeCSS from "@brains/theme-default";
import type { SitePackage } from "@brains/app";

/**
 * Default site package — default theme + default layouts.
 *
 * A clean, minimal visual identity suitable as the baseline
 * for any brain. Bundles the standard default layout, intro/about
 * templates, and the default color scheme.
 */
const site: SitePackage = {
  theme: themeCSS,
  layouts: {
    default: DefaultLayout,
    minimal: MinimalLayout,
  },
  routes,
  plugin: (config?: Record<string, unknown>): Plugin =>
    defaultSitePlugin(config ?? {}),
  entityRouteConfig: {
    post: { label: "Post" },
  },
};

export default site;
