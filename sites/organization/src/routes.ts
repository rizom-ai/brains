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
        template: "@brains/site-organization:organization-site:homepage",
        dataQuery: {},
      },
    ],
  },
  {
    id: "about",
    path: "/about",
    title: "About",
    description: "About the team or organization",
    layout: "default",
    navigation: {
      show: true,
      label: "About",
      slot: "primary",
      priority: 90,
    },
    sections: [
      {
        id: "about",
        template: "@brains/site-organization:organization-site:about",
        dataQuery: {},
      },
    ],
  },
];
