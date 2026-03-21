import type { RouteDefinitionInput } from "@brains/plugins";

/**
 * Default routes for the ranger/relay site.
 * Template names are scoped to ranger-site plugin.
 */
export const routes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Home",
    description: "Your AI-powered knowledge hub",
    layout: "minimal",
    navigation: {
      show: true,
      label: "Home",
      slot: "secondary",
      priority: 10,
    },
    sections: [{ id: "intro", template: "ranger-site:intro" }],
  },
  {
    id: "about",
    path: "/about",
    title: "About",
    description: "About this brain",
    layout: "default",
    navigation: {
      show: true,
      label: "About",
      slot: "secondary",
      priority: 90,
    },
    sections: [
      {
        id: "about",
        template: "ranger-site:about",
        dataQuery: {
          entityType: "base",
          query: {
            id: "README",
          },
        },
      },
    ],
  },
];
