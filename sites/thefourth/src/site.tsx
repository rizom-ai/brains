import { defineSite, sectionGroup, type SiteDefinition } from "@rizom/site";
import { actOne, actOneContent } from "./home/act-one";
import { actTwo, actTwoContent } from "./home/act-two";
import { actsCSS } from "./home/acts-css";
import { cover, coverContent } from "./home/cover";
import { spellScript } from "./home/spell-script";
import { TheFourthLayout } from "./layout";
import { siteCSS } from "./styles";

/**
 * The Fourth's homepage, a story in four acts. Each act is a section of the
 * home group; its words live in the brain as site-content/home/<act>.md and
 * fall back to the design's copy below.
 */
const homeSections = sectionGroup("home", {
  cover,
  "act-one": actOne,
  "act-two": actTwo,
});

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
      sections: [
        { id: "cover", template: "home.cover" },
        { id: "act-one", template: "home.act-one" },
        { id: "act-two", template: "home.act-two" },
      ],
    },
  ],
  sections: [homeSections],
  content: {
    home: {
      cover: coverContent,
      "act-one": actOneContent,
      "act-two": actTwoContent,
    },
  },
  entityDisplay: {},
  themeOverride: siteCSS + actsCSS,
  headScripts: [spellScript],
});

export default theFourthSite;
