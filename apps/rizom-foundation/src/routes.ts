import type { RouteDefinitionInput } from "@brains/plugins";
import { createEcosystemContent } from "@brains/site-rizom";

export const foundationRoutes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    layout: "default",
    navigation: {
      show: false,
      slot: "secondary",
      priority: 10,
    },
    sections: [
      {
        id: "hero",
        template: "rizom-site:foundation-hero",
        content: {},
      },
      { id: "problem", template: "rizom-site:problem", content: {} },
      { id: "answer", template: "rizom-site:answer", content: {} },
      {
        id: "pull-quote",
        template: "rizom-site:pull-quote",
        content: {},
      },
      {
        id: "research",
        template: "rizom-site:research",
        content: {},
      },
      {
        id: "events",
        template: "rizom-site:events",
        content: {},
      },
      {
        id: "support",
        template: "rizom-site:support",
        content: {},
      },
      {
        id: "ownership",
        template: "rizom-site:ownership",
        content: {},
      },
      {
        id: "mission",
        template: "rizom-site:mission",
        content: {},
      },
      {
        id: "ecosystem",
        template: "rizom-site:ecosystem",
        content: createEcosystemContent("foundation", {
          eyebrow: "The Ecosystem",
          headline: "One ecosystem. The platform, the vision, the network.",
        }),
      },
    ],
  },
];
