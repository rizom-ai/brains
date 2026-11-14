import type { SitePackage } from "@brains/site-composition";
import { SiteLayout } from "@brains/site-atlas";
import { withSiteRuntime } from "@brains/sdk/internal/site-runtime";
import { organizationSiteRuntime } from "./runtime";
import { routes } from "./routes";
import { OrganizationHomepage } from "./templates/homepage";
import { homepageDataSource } from "./datasources/homepage-datasource";

export {
  organizationSiteRuntime,
  routes,
  OrganizationHomepage,
  homepageDataSource,
};

const site: SitePackage = withSiteRuntime(
  {
    layouts: {
      default: SiteLayout,
    },
    routes,
    entityDisplay: {
      agent: { label: "Agent", navigation: { slot: "primary" } },
      topic: { label: "Topic", navigation: { slot: "secondary" } },
      link: { label: "Link", navigation: { slot: "secondary" } },
      base: { label: "Note", navigation: { show: false } },
      series: { label: "Series", navigation: { slot: "secondary" } },
      project: { label: "Project", navigation: { slot: "secondary" } },
      "social-post": {
        label: "Social Post",
        pluralName: "social-posts",
        navigation: { slot: "secondary" },
      },
      newsletter: { label: "Newsletter", navigation: { slot: "secondary" } },
      summary: { label: "Summary", navigation: { slot: "secondary" } },
    },
  },
  organizationSiteRuntime,
);

export default site;
