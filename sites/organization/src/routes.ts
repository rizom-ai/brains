import type { RouteDefinitionInput } from "@brains/site-composition";

// Default routes for the organization site; agent, topic and link pages
// are generated from their entity types.
export const routes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Home",
    description: "Organization site homepage",
    layout: "default",
    navigation: {
      show: true,
      label: "Home",
      slot: "secondary",
      priority: 10,
    },
    sections: [
      {
        id: "homepage",
        template: "organization-site:homepage",
        dataQuery: {},
      },
    ],
  },
];
