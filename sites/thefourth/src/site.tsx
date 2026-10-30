import { defineSite, sectionGroup, type SiteDefinition } from "@rizom/site";
import { actOne, actOneContent } from "./home/act-one";
import { actTwo, actTwoContent } from "./home/act-two";
import { actFourCSS, actsCSS, actThreeCSS, finaleCSS } from "./home/acts-css";
import { crossroads, crossroadsContent } from "./home/crossroads";
import { epilogue, epilogueContent } from "./home/epilogue";
import { actFour, actFourContent } from "./home/act-four";
import { actThree, actThreeContent } from "./home/act-three";
import { cover, coverContent } from "./home/cover";
import { spellScript } from "./home/spell-script";
import { chineseCSS, chineseFontScript } from "./languages";
import { TheFourthLayout } from "./layout";
import { keyholeScript, motionCSS, sparkScript } from "./motion";
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
  "act-three": actThree,
  "act-four": actFour,
  crossroads,
  epilogue,
});

export const theFourthSite: SiteDefinition = defineSite({
  // Chinese pages are built from copy saved under site-content/zh-tw/, once
  // every section and site-info have it.
  languages: ["en", "zh-TW"],
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
        { id: "act-three", template: "home.act-three" },
        { id: "act-four", template: "home.act-four" },
        { id: "crossroads", template: "home.crossroads" },
        { id: "epilogue", template: "home.epilogue" },
      ],
    },
  ],
  sections: [homeSections],
  content: {
    home: {
      cover: coverContent,
      "act-one": actOneContent,
      "act-two": actTwoContent,
      "act-three": actThreeContent,
      "act-four": actFourContent,
      crossroads: crossroadsContent,
      epilogue: epilogueContent,
    },
  },
  entityDisplay: {},
  themeOverride:
    siteCSS +
    actsCSS +
    actThreeCSS +
    actFourCSS +
    finaleCSS +
    motionCSS +
    chineseCSS,
  headScripts: [chineseFontScript, spellScript, sparkScript, keyholeScript],
});

export default theFourthSite;
