import type { Plugin } from "@brains/plugins";
import {
  DefaultLayout,
  DefaultCTALayout,
  MinimalLayout,
  CTAFooterLayout,
} from "./layouts";
import { routes as defaultRoutes } from "./routes";
import themeCSS from "@brains/theme-ranger";
import type { SitePackage } from "@brains/app";
import { RangerSitePlugin } from "./plugin";

/**
 * Customize routes for community use:
 * - Home page uses CTA footer layout with about template showing HOME entity
 * - Home is hidden from navigation (it's the landing page)
 */
const routes = defaultRoutes.map((route) => {
  if (route.id === "home") {
    return {
      ...route,
      layout: "cta-footer",
      navigation: {
        show: false,
        slot: route.navigation?.slot ?? ("primary" as const),
        priority: route.navigation?.priority ?? 50,
        label: route.navigation?.label,
      },
      sections: [
        {
          id: "main",
          template: "ranger-site:about",
          dataQuery: {
            entityType: "base",
            query: { id: "HOME" },
          },
        },
      ],
    };
  }
  return route;
});

/**
 * Ranger site package — CTA-driven community site with rizom theme.
 *
 * Extends the default site with CTA layouts and a landing page
 * that shows a HOME entity instead of the intro section.
 */
const site: SitePackage = {
  theme: themeCSS,
  layouts: {
    default: DefaultLayout,
    minimal: MinimalLayout,
    "default-cta": DefaultCTALayout,
    "cta-footer": CTAFooterLayout,
  },
  routes,
  plugin: (config?: Record<string, unknown>): Plugin =>
    new RangerSitePlugin(config ?? {}),
  entityDisplay: {
    "social-post": {
      label: "Social Post",
      navigation: {
        show: true,
        slot: "secondary",
        priority: 40,
      },
    },
    link: {
      label: "Link",
      navigation: {
        slot: "secondary",
      },
    },
  },
};

export default site;
