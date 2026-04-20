import type { RouteDefinitionInput } from "@brains/plugins";
import { createEcosystemContent } from "./sections/ecosystem";

export const workRoutes: RouteDefinitionInput[] = [
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
        template: "landing-page:work-hero",
        content: {},
      },
      {
        id: "problem",
        template: "landing-page:work-problem",
        content: {},
      },
      {
        id: "workshop",
        template: "landing-page:workshop",
        content: {},
      },
      {
        id: "personas",
        template: "landing-page:personas",
        content: {},
      },
      {
        id: "proof",
        template: "landing-page:proof",
        content: {},
      },
      {
        id: "bridge",
        template: "landing-page:bridge",
        content: {},
      },
      {
        id: "ownership",
        template: "landing-page:ownership",
        content: {},
      },
      {
        id: "mission",
        template: "landing-page:closer",
        content: {},
      },
      {
        id: "ecosystem",
        template: "landing-page:ecosystem",
        content: createEcosystemContent("work", {
          eyebrow: "The Ecosystem",
          headline: "One ecosystem. The platform, the vision, the network.",
        }),
      },
    ],
  },
];
