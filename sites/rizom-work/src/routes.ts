import type { RouteDefinitionInput } from "@rizom/site";
import { homeCopy } from "./home-copy";

// The home's chapters in order; the ids are content identity
// (site-content/home/<chapter>.md) and follow the drawing's stages, the
// closing chapter keeping its last.
const HOME_CHAPTERS = [
  "hero",
  "science",
  "problem",
  "hubs",
  "teams",
  "public",
  "partners",
  "contact",
];

export const workRoutes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Rizom Work",
    description:
      "Brains for hubs and teams, set up and kept running by Rizom B.V.",
    layout: "default",
    navigation: { show: false },
    sections: HOME_CHAPTERS.flatMap((id) => {
      const content = homeCopy[id];
      return content ? [{ id, template: `work:${id}`, content }] : [];
    }),
  },
];
