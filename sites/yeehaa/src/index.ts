import { extendSite } from "@brains/site-composition";
import siteDefault from "@brains/site-default";

/**
 * Yeehaa site package — professional layout + yeehaa content labeling.
 *
 * Provides the structure and content naming for the yeehaa site.
 * Pair it with `@brains/theme-brutalist` for the CRT-style neon styling.
 */
const site = extendSite(siteDefault, {
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
});

export default site;
