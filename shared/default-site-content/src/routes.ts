// Default routes for the site
// Site-builder will apply proper typing when consuming these
export const routes = [
  {
    id: "landing",
    path: "/",
    title: "Home",
    description: "Welcome to your Personal Brain",
    sections: [
      { id: "hero", template: "hero" },
      { id: "features", template: "features" },
      { id: "products", template: "products" },
      { id: "cta", template: "cta" },
    ],
  },
];
