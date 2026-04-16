import type { RouteDefinitionInput } from "@brains/plugins";
import { createEcosystemContent } from "@brains/site-rizom";

export const workRoutes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Rizom Work",
    description: "TMS workshops for teams that need to coordinate better.",
    layout: "default",
    navigation: {
      show: false,
      slot: "secondary",
      priority: 10,
    },
    sections: [
      {
        id: "hero",
        template: "rizom-site:work-hero",
        content: {},
      },
      {
        id: "problem",
        template: "rizom-site:work-problem",
        content: {},
      },
      {
        id: "workshop",
        template: "rizom-site:workshop",
        content: {},
      },
      {
        id: "personas",
        template: "rizom-site:personas",
        content: {},
      },
      {
        id: "proof",
        template: "rizom-site:proof",
        content: {},
      },
      {
        id: "bridge",
        template: "rizom-site:bridge",
        content: {},
      },
      {
        id: "ownership",
        template: "rizom-site:ownership",
        content: {},
      },
      {
        id: "mission",
        template: "rizom-site:closer",
        content: {},
      },
      {
        id: "ecosystem",
        template: "rizom-site:ecosystem",
        content: createEcosystemContent("work"),
      },
    ],
  },
];
