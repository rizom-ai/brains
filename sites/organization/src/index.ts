import type { Plugin } from "@brains/plugins";
import type { SitePackage } from "@brains/site-composition";
import { SiteLayout } from "@brains/site-atlas";
import type { OrganizationSiteConfigInput } from "./config";
import { OrganizationSitePlugin, organizationSitePlugin } from "./plugin";
import { routes } from "./routes";
import { OrganizationHomepage } from "./templates/homepage";
import { OrganizationHomepageDataSource } from "./datasources/homepage-datasource";

export {
  OrganizationSitePlugin,
  organizationSitePlugin,
  routes,
  OrganizationHomepage,
  OrganizationHomepageDataSource,
};

const site: SitePackage<OrganizationSiteConfigInput, Plugin> = {
  layouts: {
    default: SiteLayout,
  },
  routes,
  plugin: organizationSitePlugin,
  entityDisplay: {
    agent: { label: "Agent", navigation: { slot: "primary" } },
    topic: { label: "Topic", navigation: { slot: "secondary" } },
    link: { label: "Link", navigation: { slot: "secondary" } },
    base: { label: "Note", navigation: { show: false } },
  },
};

export default site;
