import type { RouteDefinitionInput } from "@brains/site-composition";

export const routes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Home",
    description: "Personal site homepage",
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
        template: "personal-site:homepage",
        dataQuery: {},
      },
    ],
  },
  {
    id: "about",
    path: "/about",
    title: "About",
    description: "About page",
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
        template: "personal-site:about",
        dataQuery: {},
      },
    ],
  },
];
