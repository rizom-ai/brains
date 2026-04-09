import type { SitePackage } from "@brains/site-composition";
import {
  PersonalSitePlugin,
  personalSitePlugin,
  type PersonalSiteConfigInput,
} from "./plugin";
import { routes } from "./routes";
import { HomepageLayout, type HomepageData } from "./templates/homepage";
import { AboutPageLayout, type AboutPageData } from "./templates/about";
import { HomepageDataSource } from "./datasources/homepage-datasource";
import { AboutDataSource } from "./datasources/about-datasource";
import { PersonalLayout } from "./layouts/PersonalLayout";

export {
  PersonalSitePlugin,
  personalSitePlugin,
  type PersonalSiteConfigInput,
  routes,
  HomepageLayout,
  type HomepageData,
  AboutPageLayout,
  type AboutPageData,
  HomepageDataSource,
  AboutDataSource,
  PersonalLayout,
};

const site: SitePackage<PersonalSiteConfigInput> = {
  layouts: {
    default: PersonalLayout,
  },
  routes,
  plugin: personalSitePlugin,
  entityDisplay: {
    post: { label: "Post" },
    series: {
      label: "Series",
      navigation: { show: false },
    },
  },
};

export default site;
