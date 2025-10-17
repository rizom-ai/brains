// About routes
export const routes = [
  {
    id: "about",
    path: "/about",
    title: "About Team Brain",
    description: "Getting started guide and information about Team Brain",
    layout: "minimal",
    navigation: {
      show: true,
      label: "About",
      slot: "secondary",
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
