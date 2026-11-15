import type { SitePackage } from "@brains/site-composition";
import { withSiteRuntime } from "@brains/sdk/internal/site-runtime";
import { professionalSiteRuntime } from "./runtime";
import { routes } from "./routes";
import {
  HomepageListLayout,
  type HomepageListData,
} from "./templates/homepage-list";
import { AboutPageLayout, type AboutPageData } from "./templates/about";
import { AboutHighlightsLayout } from "./templates/about-highlights";
import {
  SubscribeThanksLayout,
  SubscribeErrorLayout,
} from "./templates/subscribe-result";
import { homepageListDataSource } from "./datasources/homepage-datasource";
import { aboutDataSource } from "./datasources/about-datasource";
import { SiteLayout } from "@brains/site-atlas";

export {
  professionalSiteRuntime,
  routes,
  HomepageListLayout,
  type HomepageListData,
  AboutPageLayout,
  type AboutPageData,
  AboutHighlightsLayout,
  SubscribeThanksLayout,
  SubscribeErrorLayout,
  homepageListDataSource,
  aboutDataSource,
};

const site: SitePackage = withSiteRuntime(
  {
    layouts: {
      default: SiteLayout,
    },
    routes,
    entityDisplay: {
      post: { label: "Post", citable: true },
      deck: { label: "Deck", citable: true },
      project: { label: "Project", citable: true },
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
  },
  professionalSiteRuntime,
);

export default site;
