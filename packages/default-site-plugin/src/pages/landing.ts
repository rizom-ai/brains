import type { RouteDefinition } from "@brains/types";

export const landingRoute: RouteDefinition = {
  path: "/",
  title: "Home",
  description: "Welcome to your Personal Brain",
  sections: [
    {
      id: "hero",
      template: "hero",
      contentEntity: {
        entityType: "site-content",
        template: "landing-hero",
        query: {
          page: "landing",
          section: "hero",
          environment: "preview",
        },
      },
    },
    {
      id: "features",
      template: "features",
      contentEntity: {
        entityType: "site-content",
        template: "landing-features",
        query: {
          page: "landing",
          section: "features",
          environment: "preview",
        },
      },
    },
    {
      id: "products",
      template: "products",
      contentEntity: {
        entityType: "site-content",
        template: "landing-products",
        query: {
          page: "landing",
          section: "products",
          environment: "preview",
        },
      },
    },
    {
      id: "cta",
      template: "cta",
      contentEntity: {
        entityType: "site-content",
        template: "landing-cta",
        query: {
          page: "landing",
          section: "cta",
          environment: "preview",
        },
      },
    },
  ],
};
