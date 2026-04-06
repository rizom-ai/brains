import type { Plugin } from "@brains/plugins";
import {
  professionalSitePlugin,
  ProfessionalLayout,
  routes,
} from "@brains/layout-professional";
import themeCSS from "@brains/theme-default";
import type { SitePackage } from "@brains/app";

/**
 * Rover default site package — clean default theme + professional layout.
 *
 * A neutral professional site identity suitable as the out-of-box
 * experience for the rover brain model. Uses the default blue/orange
 * palette without decorative animations or branded styling.
 */
const site: SitePackage = {
  theme: themeCSS,
  layouts: {
    default: ProfessionalLayout,
  },
  routes,
  plugin: (config?: Record<string, unknown>): Plugin =>
    professionalSitePlugin(config ?? {}),
  entityDisplay: {
    post: { label: "Post" },
    deck: { label: "Deck" },
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
