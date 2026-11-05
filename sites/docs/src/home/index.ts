import { sectionGroup, type SiteSectionGroup } from "@rizom/site";
import { docsHomeDoorsSection } from "./doors";
import { docsHomeHeroSection } from "./hero";
import homeCss from "./home.css" with { type: "text" };

export { DocsHomeDoors, type DocsHomeDoorsContent } from "./doors";
export { DocsHomeHero, type DocsHomeHeroContent } from "./hero";
export { docsHomeContent } from "./content";
export { DOCS_HOME_SCRIPT_SRC, docsHomeScript } from "./script";

/** The home's own sections, placed as docs-home:hero and docs-home:doors. */
export const docsHomeSections: SiteSectionGroup = sectionGroup("docs-home", {
  hero: docsHomeHeroSection,
  doors: docsHomeDoorsSection,
});

/** The home's styles, added to the site's theme. */
export const docsHomeCss: string = homeCss;
