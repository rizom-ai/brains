import type { PageDefinition } from "@brains/types";

export const landingPage: PageDefinition = {
  path: "/",
  title: "Home",
  description: "Welcome to your Personal Brain",
  sections: [
    {
      id: "hero",
      layout: "hero",
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
      layout: "features",
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
      layout: "products",
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
      layout: "cta",
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
