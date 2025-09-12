// Default routes for the minimal site
export const routes = [
  {
    id: "home",
    path: "/",
    title: "Home",
    description: "Personal Brain Overview",
    navigation: {
      show: true,
      label: "Home",
      slot: "primary",
      priority: 10,
    },
    sections: [{ id: "intro", template: "intro" }],
  },
];
