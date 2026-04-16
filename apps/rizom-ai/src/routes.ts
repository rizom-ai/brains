import type { RouteDefinitionInput } from "@brains/plugins";
import { createEcosystemContent } from "@brains/site-rizom";

export const aiRoutes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Rizom AI",
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
      {
        id: "ecosystem",
        template: "rizom-site:ecosystem",
        content: createEcosystemContent("ai"),
      },
    ],
  },
];
