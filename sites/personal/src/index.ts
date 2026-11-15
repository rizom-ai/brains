import type { SitePackage } from "@brains/site-composition";
import { withSiteRuntime } from "@brains/sdk/internal/site-runtime";
import { personalSiteRuntime, type PersonalSiteConfigInput } from "./runtime";
import { routes } from "./routes";
import { HomepageLayout, type HomepageData } from "./templates/homepage";
import { AboutPageLayout, type AboutPageData } from "./templates/about";
import { homepageDataSource } from "./datasources/homepage-datasource";
import { aboutDataSource } from "./datasources/about-datasource";
import { PersonalLayout } from "./layouts/PersonalLayout";

export {
  personalSiteRuntime,
  type PersonalSiteConfigInput,
  routes,
  HomepageLayout,
  type HomepageData,
  AboutPageLayout,
  type AboutPageData,
  homepageDataSource,
  aboutDataSource,
  PersonalLayout,
};

const site: SitePackage = withSiteRuntime(
  {
    layouts: {
      default: PersonalLayout,
    },
    routes,
    entityDisplay: {
      post: { label: "Post" },
      series: {
        label: "Series",
        navigation: { show: false },
      },
    },
  },
  personalSiteRuntime,
);

export default site;
