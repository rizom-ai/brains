import { defineSite, sectionGroup, type SiteDefinition } from "@rizom/site";
import { fieldScript } from "./field/script";
import { fit, fitContent } from "./home/fit";
import { labs, labsContent } from "./home/labs";
import { memory, memoryContent } from "./home/memory";
import { opening, openingContent } from "./home/opening";
import { pipeline, pipelineContent } from "./home/pipeline";
import { programs, programsContent } from "./home/programs";
import { HubLayout } from "./layout";
import { siteCSS } from "./styles";

/**
 * The hub's landing page, a story told over a field of lights. Each chapter
 * is a section of the home group; its words live in the brain as
 * site-content/home/<chapter>.md and fall back to the design's copy below,
 * and its `data-hub-scene` tells the field what to draw (see ./field).
 */
const homeSections = sectionGroup("home", {
  opening,
  pipeline,
  programs,
  memory,
  labs,
  fit,
});

export const hubSite: SiteDefinition = defineSite({
  layouts: { default: HubLayout },
  routes: [
    {
      id: "home",
      path: "/",
      title: "Rizom Hub",
      description:
        "Where organizations, researchers and independent people work on questions that matter to them, and the ecosystem keeps what it learns.",
      layout: "default",
      navigation: { show: false },
      sections: [
        { id: "opening", template: "home.opening" },
        { id: "pipeline", template: "home.pipeline" },
        { id: "programs", template: "home.programs" },
        { id: "memory", template: "home.memory" },
        { id: "labs", template: "home.labs" },
        { id: "fit", template: "home.fit" },
      ],
    },
  ],
  sections: [homeSections],
  content: {
    home: {
      opening: openingContent,
      pipeline: pipelineContent,
      programs: programsContent,
      memory: memoryContent,
      labs: labsContent,
      fit: fitContent,
    },
  },
  entityDisplay: {},
  themeOverride: siteCSS,
  headScripts: [fieldScript],
});

export default hubSite;
