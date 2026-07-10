import type { RouteDefinitionInput } from "@brains/site-composition";
import { foundationSections } from "./foundation";
import { homeSections } from "./home";
import { toRouteSections } from "./section-def";
import { workSections } from "./work";

// The three rooms of the consolidated rizom.ai site (rev-5 IA). Section
// lists live with their page modules; navigation is owned by the
// layout's two-tier chrome, so routes stay out of the slot-based
// navigation model.
export const rizomAiRoutes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Rizom",
    description: "Build the agent that represents you",
    layout: "default",
    navigation: { show: false, label: "Home", slot: "primary", priority: 10 },
    sections: toRouteSections("home", homeSections),
  },
  {
    id: "writing",
    path: "/writing",
    title: "Writing — Rizom",
    description: "Everything published, in one index",
    layout: "default",
    navigation: {
      show: false,
      label: "Writing",
      slot: "primary",
      priority: 15,
    },
    sections: [
      {
        id: "index",
        template: "rizom-ai-site:writing",
        dataQuery: { entityType: "post", query: { limit: 100 } },
      },
      {
        id: "talks",
        template: "rizom-ai-site:writing-talks",
        dataQuery: { entityType: "deck", query: { limit: 100 } },
      },
    ],
  },
  {
    id: "work",
    path: "/work",
    title: "Rizom Work",
    description: "Coordination for the AI era",
    layout: "default",
    navigation: { show: false, label: "Work", slot: "primary", priority: 20 },
    sections: toRouteSections("work", workSections),
  },
  {
    id: "foundation",
    path: "/foundation",
    title: "Rizom Foundation",
    description:
      "Essays, gatherings, and stewardship of open AI infrastructure",
    layout: "default",
    navigation: {
      show: false,
      label: "Foundation",
      slot: "primary",
      priority: 30,
    },
    sections: toRouteSections("foundation", foundationSections),
  },
];
