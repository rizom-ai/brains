// Default routes for the minimal site
export const routes = [
  {
    id: "home",
    path: "/",
    title: "Home",
    description: "Personal Brain Overview",
    layout: "minimal", // Use minimal layout without header
    navigation: {
      show: true,
      label: "Home",
      slot: "primary",
      priority: 10,
    },
    sections: [{ id: "intro", template: "intro" }],
  },
  {
    id: "about",
    path: "/about",
    title: "About Recall",
    description: "Getting started guide and tutorial for Recall",
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
        template: "about",
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
