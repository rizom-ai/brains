import type { RouteDefinitionInput } from "@brains/plugins";

/**
 * Routes for all rizom site variants (ai / foundation / work).
 *
 * Variants share the same routes; what differs is the hero copy
 * (via variant-specific defaults in the hero template) and the
 * canvas script (injected via the site plugin's head script hook).
 *
 * The home route passes `content: {}` so the hero template falls
 * back to its layout component's defaults when no site-content
 * override entity exists.
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
