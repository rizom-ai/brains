import type { RouteDefinitionInput } from "@rizom/site";

/**
 * The consolidated Rizom site routes. The home page composes the rev-5 section
 * set from the "home" content namespace; the layout owns navigation (the
 * two-tier faces strip), so routes stay out of the entity nav.
 */
export const aiRoutes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Rizom",
    description: "Build the agent that represents you",
    layout: "default",
    navigation: { show: false },
    sections: [
      { id: "hero", template: "home:hero" },
      { id: "growth", template: "home:growth" },
      { id: "problem", template: "home:problem" },
      { id: "your-data", template: "home:your-data" },
      { id: "quickstart", template: "home:quickstart" },
      { id: "mission", template: "home:mission" },
      { id: "faces", template: "home:faces" },
      { id: "alive", template: "home:alive" },
    ],
  },
];
