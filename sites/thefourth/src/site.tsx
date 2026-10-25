import { defineSite, sectionGroup, type SiteDefinition } from "@rizom/site";
import { cover, coverContent } from "./home/cover";
import { TheFourthLayout } from "./layout";
import { siteCSS } from "./styles";

/**
 * The Fourth's homepage, a story in four acts. Each act is a section of the
 * home group; its words live in the brain as site-content/home/<act>.md and
 * fall back to the design's copy below.
 */
const homeSections = sectionGroup("home", { cover });

export const theFourthSite: SiteDefinition = defineSite({
  layouts: { default: TheFourthLayout },
  routes: [
    {
      id: "home",
      path: "/",
      title: "The Fourth",
      description:
        "A brand consultancy in Taipei, for products, research and impact that are hard to explain and worth understanding.",
      layout: "default",
      navigation: { show: false },
      sections: [{ id: "cover", template: "home.cover" }],
    },
  ],
  sections: [homeSections],
  content: { home: { cover: coverContent } },
  entityDisplay: {},
  themeOverride: siteCSS,
});

export default theFourthSite;
