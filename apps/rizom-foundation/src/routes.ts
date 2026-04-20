import type { RouteDefinitionInput } from "@brains/plugins";
import { createEcosystemContent } from "./sections/ecosystem";

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
        template: "landing-page:foundation-hero",
        content: {},
      },
      { id: "problem", template: "landing-page:problem", content: {} },
      { id: "answer", template: "landing-page:answer", content: {} },
      {
        id: "pull-quote",
        template: "landing-page:pull-quote",
        content: {},
      },
      {
        id: "research",
        template: "landing-page:research",
        content: {},
      },
      {
        id: "events",
        template: "landing-page:events",
        content: {},
      },
      {
        id: "support",
        template: "landing-page:support",
        content: {},
      },
      {
        id: "ownership",
        template: "landing-page:ownership",
        content: {},
      },
      {
        id: "mission",
        template: "landing-page:mission",
        content: {},
      },
      {
        id: "ecosystem",
        template: "landing-page:ecosystem",
        content: createEcosystemContent("foundation", {
          eyebrow: "The Ecosystem",
          headline: "One ecosystem. The platform, the vision, the network.",
        }),
      },
    ],
  },
];
