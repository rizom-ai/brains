export const workRoutes = [
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
        id: "problem",
        template: "landing-page:problem",
        content: {},
      },
      {
        id: "workshop",
        template: "landing-page:workshop",
        content: {},
      },
      {
        id: "credibility",
        template: "landing-page:credibility",
        content: {},
      },
      {
        id: "personas",
        template: "landing-page:personas",
        content: {},
      },
      {
        id: "proof",
        template: "landing-page:proof",
        content: {},
      },
      {
        id: "ownership",
        template: "landing-page:ownership",
        content: {},
      },
      {
        id: "mission",
        template: "landing-page:closer",
        content: {},
      },
      {
        id: "ecosystem",
        template: "landing-page:ecosystem",
        content: {},
      },
    ],
  },
];
