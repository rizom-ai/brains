import { type CreateRizomSiteOptions } from "@brains/site-rizom";
import { createEcosystemContent } from "./sections/ecosystem";

export const aiRoutes: CreateRizomSiteOptions["routes"] = [
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
      { id: "hero", template: "landing-page:hero", content: {} },
      { id: "problem", template: "landing-page:problem", content: {} },
      { id: "answer", template: "landing-page:answer", content: {} },
      { id: "products", template: "landing-page:products", content: {} },
      { id: "ownership", template: "landing-page:ownership", content: {} },
      { id: "quickstart", template: "landing-page:quickstart", content: {} },
      { id: "mission", template: "landing-page:mission", content: {} },
      {
        id: "ecosystem",
        template: "landing-page:ecosystem",
        content: createEcosystemContent("ai", {
          eyebrow: "The Ecosystem",
          headline: "One ecosystem. The platform, the vision, the network.",
        }),
      },
    ],
  },
];
