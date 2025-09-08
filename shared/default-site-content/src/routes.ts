// Default routes for the site
// Site-builder will apply proper typing when consuming these
export const routes = [
  {
    id: "landing",
    path: "/",
    title: "Home",
    description: "Welcome to your Personal Brain",
    navigation: {
      show: true,
      label: "Home",
      slot: "primary",
      priority: 10, // Core page - high priority
    },
    sections: [
      { id: "hero", template: "hero" },
      { id: "features", template: "features" },
      { id: "products", template: "products" },
      { id: "cta", template: "cta" },
    ],
  },
];
