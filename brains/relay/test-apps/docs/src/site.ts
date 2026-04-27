import { extendSite } from "@brains/site-composition";
import rizomSite from "@brains/site-rizom";

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
      sections: [
        {
          id: "docs",
          template: "docs:doc-list",
          dataQuery: {
            entityType: "doc",
            query: { limit: 100 },
          },
        },
      ],
    },
  ],
});
