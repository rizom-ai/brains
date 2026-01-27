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
  {
    id: "subscribe-thanks",
    path: "/subscribe/thanks",
    title: "Thanks for subscribing",
    description: "Newsletter subscription confirmation",
    layout: "default",
    navigation: {
      show: false,
    },
    sections: [
      {
        id: "subscribe-thanks",
        template: "professional-site:subscribe-thanks",
        dataQuery: {},
        content: {},
      },
    ],
  },
  {
    id: "subscribe-error",
    path: "/subscribe/error",
    title: "Subscription failed",
    description: "Newsletter subscription error",
    layout: "default",
    navigation: {
      show: false,
    },
    sections: [
      {
        id: "subscribe-error",
        template: "professional-site:subscribe-error",
        dataQuery: {},
        content: {},
      },
    ],
  },
];
