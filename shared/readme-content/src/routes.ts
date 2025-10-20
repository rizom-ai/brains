// About routes
export const routes = [
  {
    id: "about",
    path: "/about",
    title: "About Recall",
    description: "Getting started guide and tutorial for Recall",
    layout: "minimal",
    navigation: {
      show: true,
      label: "About",
      slot: "primary",
      priority: 90,
    },
    sections: [
      {
        id: "about",
        template: "readme",
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
