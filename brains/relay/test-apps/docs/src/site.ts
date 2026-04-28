import { extendSite } from "@brains/site-composition";
import rizomSite from "@brains/site-rizom";

const docsSections = [
  {
    id: "docs",
    template: "docs:doc-list",
    dataQuery: {
      entityType: "doc",
      query: { limit: 100 },
    },
  },
];

export default extendSite(rizomSite, {
  routes: [
    {
      id: "docs-home",
      path: "/",
      title: "Documentation",
      description: "Brains documentation",
      layout: "default",
      navigation: {
        show: true,
        label: "Docs",
        slot: "primary",
        priority: 10,
      },
      sections: docsSections,
    },
    {
      id: "docs",
      path: "/docs",
      title: "Documentation",
      description: "Brains documentation",
      layout: "default",
      sections: docsSections,
    },
  ],
});
