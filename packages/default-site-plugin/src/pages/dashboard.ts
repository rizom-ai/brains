import type { PageDefinition } from "@brains/types";

export const dashboardPage: PageDefinition = {
  path: "/dashboard",
  title: "Dashboard",
  description: "Your Personal Brain Dashboard",
  sections: [
    {
      id: "dashboard",
      layout: "dashboard",
      contentEntity: {
        entityType: "site-content",
        template: "dashboard",
        query: {
          page: "dashboard",
          section: "index",
          environment: "preview",
        },
      },
    },
  ],
};
