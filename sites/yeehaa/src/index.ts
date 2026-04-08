import type { Plugin } from "@brains/plugins";
import {
  professionalSitePlugin,
  ProfessionalLayout,
  routes,
} from "@brains/layout-professional";
import type { SitePackage } from "@brains/app";

/**
 * Yeehaa site package — brutalist theme + professional layout.
 *
 * Bundles visual identity (CRT-style neon green brutalism),
 * page structure (professional editorial layout), and content naming
 * (essays, presentations, projects) into a single deployable unit.
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
