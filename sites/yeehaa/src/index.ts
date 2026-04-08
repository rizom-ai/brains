import type { Plugin } from "@brains/plugins";
import {
  professionalSitePlugin,
  ProfessionalLayout,
  routes,
} from "@brains/layout-professional";
import type { SitePackage } from "@brains/app";

/**
 * Yeehaa site package — professional layout + yeehaa content labeling.
 *
 * Provides the structure and content naming for the yeehaa site.
 * Pair it with `@brains/theme-brutalist` for the CRT-style neon styling.
 */
const site: SitePackage = {
  layouts: {
    default: ProfessionalLayout,
  },
  routes,
  plugin: (config?: Record<string, unknown>): Plugin =>
    professionalSitePlugin(config ?? {}),
  entityDisplay: {
    post: { label: "Essay" },
    deck: { label: "Presentation" },
    project: { label: "Project" },
    series: {
      label: "Series",
      navigation: { slot: "secondary" },
    },
    topic: {
      label: "Topic",
      navigation: { slot: "secondary" },
    },
    link: {
      label: "Link",
      navigation: { slot: "secondary" },
    },
    base: {
      label: "Note",
      navigation: { show: false },
    },
    "social-post": {
      label: "Social Post",
      pluralName: "social-posts",
      navigation: { slot: "secondary" },
    },
    newsletter: {
      label: "Newsletter",
      navigation: { slot: "secondary" },
    },
  },
};

export default site;
