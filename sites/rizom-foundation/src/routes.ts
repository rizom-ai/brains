import type { RouteDefinitionInput } from "@rizom/site";
import { homeCopy } from "./home-copy";
import { commonSenseParts, supportParts } from "./reading-copy";

// The home's chapters in order; the ids are content identity
// (site-content/home/<chapter>.md) and follow the drawing's stages, the board
// and the follow chapters keeping its last.
const HOME_CHAPTERS = [
  "hero",
  "writing",
  "mission",
  "events",
  "support",
  "why",
  "board",
  "follow",
];

export const foundationRoutes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Rizom Foundation",
    description:
      "The case for collective intelligence: memory that people and organizations own, connections no one in the middle owns, held as a commons that cannot be sold.",
    layout: "default",
    navigation: { show: false },
    sections: HOME_CHAPTERS.flatMap((id) => {
      const content = homeCopy[id];
      return content ? [{ id, template: `foundation:${id}`, content }] : [];
    }),
  },
  {
    id: "common-sense",
    path: "/common-sense",
    title: "Common Sense — Rizom Foundation",
    description:
      "Common Sense: the case for collective intelligence, by the Rizom Foundation.",
    layout: "default",
    navigation: { show: false },
    sections: commonSenseParts,
  },
  {
    id: "support",
    path: "/support",
    title: "Become a founding supporter — Rizom Foundation",
    description:
      "The Rizom Foundation takes no investors. Its first year is started by founding supporters.",
    layout: "default",
    navigation: { show: false },
    sections: supportParts,
  },
];
