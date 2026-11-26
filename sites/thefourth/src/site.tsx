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
import { formsCSS } from "./forms";
import { chineseCSS, chineseFontScript } from "./languages";
import { TheFourthLayout } from "./layout";
import { keyholeScript, motionCSS, sparkScript } from "./motion";
import {
  aboutRoute,
  cast,
  foldScript,
  hero,
  mission,
  offStage,
} from "./pages/about";
import { intro, nextStep } from "./pages/common";
import {
  benefits,
  howCase,
  howRoute,
  method,
  pattern,
  story,
} from "./pages/how";
import { pagesCSS } from "./pages/pages-css";
import { brandTest, contact, paths, steps, talkRoute } from "./pages/talk";
import { loop, note, services, whatRoute } from "./pages/what";
import { whoRoute, worlds } from "./pages/who";
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

/** What every inner page can open and close with. */
const pageSections = sectionGroup("page", {
  intro,
  "next-step": nextStep,
});

const whatSections = sectionGroup("what", { services, loop, note });

const whoSections = sectionGroup("who", { worlds });

const howSections = sectionGroup("how", {
  case: howCase,
  story,
  pattern,
  method,
  benefits,
});

const aboutSections = sectionGroup("about", {
  hero,
  mission,
  cast,
  "off-stage": offStage,
});

const talkSections = sectionGroup("talk", {
  paths,
  steps,
  "brand-test": brandTest,
  contact,
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
        { id: "cover", template: "home:cover" },
        { id: "act-one", template: "home:act-one" },
        { id: "act-two", template: "home:act-two" },
        { id: "act-three", template: "home:act-three" },
        { id: "act-four", template: "home:act-four" },
        { id: "crossroads", template: "home:crossroads" },
        { id: "epilogue", template: "home:epilogue" },
      ],
    },
    whatRoute,
    whoRoute,
    howRoute,
    aboutRoute,
    talkRoute,
  ],
  sections: [
    homeSections,
    pageSections,
    whatSections,
    whoSections,
    howSections,
    aboutSections,
    talkSections,
  ],
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
    pagesCSS +
    formsCSS +
    chineseCSS,
  headScripts: [
    chineseFontScript,
    spellScript,
    sparkScript,
    keyholeScript,
    foldScript,
  ],
});

export default theFourthSite;
