import type { RouteDefinitionInput } from "@brains/site-composition";
import {
  FOUNDATION_HERO_FALLBACK,
  HOME_HERO_FALLBACK,
  WORK_HERO_FALLBACK,
} from "./content";

// The three rooms of the consolidated rizom.ai site (rev-5 IA). Navigation
// is owned by the layout's two-tier chrome (faces strip + per-face nav), so
// routes stay out of the slot-based navigation model.
export const rizomAiRoutes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Rizom",
    description: "Build the agent that represents you",
    layout: "default",
    navigation: { show: false, label: "Home", slot: "primary", priority: 10 },
    sections: [
      {
        id: "hero",
        template: "rizom-ai-site:home-hero",
        content: HOME_HERO_FALLBACK,
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
    sections: [
      {
        id: "hero",
        template: "rizom-ai-site:work-hero",
        content: WORK_HERO_FALLBACK,
      },
    ],
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
    sections: [
      {
        id: "hero",
        template: "rizom-ai-site:foundation-hero",
        content: FOUNDATION_HERO_FALLBACK,
      },
    ],
  },
];
