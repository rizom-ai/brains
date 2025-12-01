// Default routes for professional site
export const routes = [
  {
    id: "home",
    path: "/",
    title: "Home",
    description: "Professional site homepage",
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
        template: "professional-site:homepage-list",
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
        template: "professional-site:about",
        dataQuery: {},
      },
    ],
  },
];
