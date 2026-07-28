import type { SitePackageOverrides } from "@brains/site-composition";

const siteOverrides: SitePackageOverrides = {
  routes: [
    {
      id: "ecosystem",
      path: "/ecosystem",
      title: "Team Brain ecosystem test",
      description: "Team Brain with the opt-in Rizom ecosystem section",
      layout: "default",
      navigation: {
        show: true,
        label: "Ecosystem",
        slot: "primary",
        priority: 80,
      },
      sections: [
        {
          id: "ecosystem",
          template: "rizom-ecosystem:ecosystem",
          dataQuery: { query: { id: "rizom-ecosystem" } },
        },
      ],
    },
  ],
};

export default siteOverrides;
