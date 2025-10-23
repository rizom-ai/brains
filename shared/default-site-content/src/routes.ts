// Default routes for the minimal site
export const routes = [
  {
    id: "home",
    path: "/",
    title: "Home",
    description: "Your AI-powered knowledge hub",
    layout: "minimal", // Use minimal layout without header
    navigation: {
      show: true, // Show in footer
      label: "Home",
      slot: "secondary", // Footer only
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
      slot: "secondary", // Footer only
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
