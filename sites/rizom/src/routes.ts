import type { RouteDefinitionInput } from "@brains/plugins";

/**
 * Routes for all rizom site variants (ai / foundation / work).
 *
 * Variants share the same routes; what differs is the section
 * copy (each app ships its own site-content entities under
 * `brain-data/site-content/home/`) and the canvas script
 * (injected via the site plugin's head script hook).
 *
 * Each section passes `content: {}` because the section's content
 * is supplied by the matching site-content entity at build time —
 * site-builder pairs each section by routeId+sectionId. There are
 * no inline content overrides at the route level.
 */
export const routes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Rizom",
    description: "Build the agent that represents you.",
    layout: "default",
    navigation: {
      show: false,
      slot: "secondary",
      priority: 10,
    },
    sections: [
      { id: "hero", template: "rizom-site:hero", content: {} },
      { id: "problem", template: "rizom-site:problem", content: {} },
      { id: "answer", template: "rizom-site:answer", content: {} },
      { id: "products", template: "rizom-site:products", content: {} },
      { id: "ownership", template: "rizom-site:ownership", content: {} },
      { id: "quickstart", template: "rizom-site:quickstart", content: {} },
      { id: "mission", template: "rizom-site:mission", content: {} },
      { id: "ecosystem", template: "rizom-site:ecosystem", content: {} },
    ],
  },
];
