import type { Plugin } from "@brains/plugins";
import type { SitePackage } from "@brains/site-composition";
import { ProfessionalSitePlugin, professionalSitePlugin } from "./plugin";
import type { ProfessionalSiteConfigInput } from "./config";
import { routes } from "./routes";
import {
  HomepageListLayout,
  type HomepageListData,
} from "./templates/homepage-list";
import { AboutPageLayout, type AboutPageData } from "./templates/about";
import {
  SubscribeThanksLayout,
  SubscribeErrorLayout,
} from "./templates/subscribe-result";
import { HomepageListDataSource } from "./datasources/homepage-datasource";
import { AboutDataSource } from "./datasources/about-datasource";
import { ProfessionalLayout } from "./layouts/ProfessionalLayout";

export {
  ProfessionalSitePlugin,
  professionalSitePlugin,
  routes,
  HomepageListLayout,
  type HomepageListData,
  AboutPageLayout,
  type AboutPageData,
  SubscribeThanksLayout,
  SubscribeErrorLayout,
  HomepageListDataSource,
  AboutDataSource,
  ProfessionalLayout,
};

const site: SitePackage<ProfessionalSiteConfigInput, Plugin> = {
  layouts: {
    default: ProfessionalLayout,
  },
  routes,
  plugin: professionalSitePlugin,
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
