import { DefaultRizomLayout } from "@brains/site-rizom";

export default {
  layouts: {
    default: DefaultRizomLayout,
  },
  routes: [
    {
      id: "home",
      path: "/",
      title: "Relay ecosystem test",
      description: "Relay with the opt-in Rizom ecosystem section",
      layout: "default",
      navigation: { show: false },
      sections: [
        {
          id: "ecosystem",
          template: "rizom-ecosystem:ecosystem",
          dataQuery: { query: { id: "rizom-ecosystem" } },
        },
      ],
    },
  ],
  entityDisplay: {},
};
