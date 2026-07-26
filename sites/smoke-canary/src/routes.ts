import type { RouteDefinitionInput } from "@rizom/brain/site";

/**
 * Single self-contained route. The section renders our static `home` template
 * with inline content, so there is no datasource and no dependency on brain
 * entities (profile, posts, site-info).
 */
export const routes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Rover Site Canary",
    description:
      "Deterministic canary page proving the hosted site+theme package pipeline.",
    layout: "default",
    navigation: { show: false },
    sections: [
      {
        id: "home",
        template: "smoke-canary-site:home",
        content: {},
      },
    ],
  },
];
