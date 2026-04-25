export const foundationRoutes = [
  {
    id: "home",
    path: "/",
    layout: "default",
    navigation: {
      show: false,
      slot: "secondary",
      priority: 10,
    },
    sections: [
      {
        id: "hero",
        template: "landing-page:hero",
        content: {},
      },
      {
        id: "pull-quote",
        template: "landing-page:pull-quote",
        content: {},
      },
      {
        id: "research",
        template: "landing-page:research",
        content: {},
      },
      {
        id: "events",
        template: "landing-page:events",
        content: {},
      },
      {
        id: "support",
        template: "landing-page:support",
        content: {},
      },
      {
        id: "ownership",
        template: "landing-page:ownership",
        content: {},
      },
      {
        id: "mission",
        template: "landing-page:mission",
        content: {},
      },
      {
        id: "ecosystem",
        template: "landing-page:ecosystem",
      },
    ],
  },
];
