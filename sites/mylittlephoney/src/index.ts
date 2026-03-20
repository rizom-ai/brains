// Types for CSS imports are defined in types.d.ts
/// <reference types="./types.d.ts" />

import type { Plugin } from "@brains/plugins";
import {
  personalSitePlugin,
  PersonalLayout,
  routes,
} from "@brains/layout-personal";
import { composeTheme } from "@brains/theme-base";
import type { SitePackage } from "@brains/app";
import themeCSS from "./theme.css" with { type: "text" };

/**
 * mylittlephoney site package — pink unicorn theme + personal layout.
 *
 * Bundles a playful candy-pink visual identity with a clean
 * blog-focused personal layout into a single deployable unit.
 */
const site: SitePackage = {
  theme: composeTheme(themeCSS),
  layout: PersonalLayout,
  routes,
  plugin: (config?: Record<string, unknown>): Plugin =>
    personalSitePlugin(config ?? {}),
  entityRouteConfig: {
    post: { label: "Post" },
  },
};

export default site;
