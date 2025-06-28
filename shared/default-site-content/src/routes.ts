import type { RouteDefinition } from "@brains/view-registry";

export const routes: RouteDefinition[] = [
  {
    id: "landing",
    path: "/",
    title: "Home",
    description: "Welcome to your Personal Brain",
    sections: [
      { id: "hero", template: "hero" },
      { id: "features", template: "features" },
      { id: "products", template: "products" },
      { id: "cta", template: "cta" },
    ],
  },
];
