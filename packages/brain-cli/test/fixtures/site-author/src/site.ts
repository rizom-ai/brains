import {
  PersonalLayout,
  ProfessionalLayout,
  personalRoutes,
  professionalRoutes,
  personalSitePlugin,
  professionalSitePlugin,
  routes,
  type EntityDisplayEntry,
  type Plugin,
  type RouteDefinitionInput,
  type SitePackage,
} from "@rizom/brain/site";

const postDisplay: EntityDisplayEntry = {
  label: "Post",
  navigation: { show: true, slot: "primary", priority: 10 },
};

const extraRoute: RouteDefinitionInput = {
  path: "/fixture",
  id: "fixture",
};

const personalPlugin: Plugin = personalSitePlugin({ title: "Fixture" });
const professionalPlugin: Plugin = professionalSitePlugin({ title: "Fixture" });
void [
  personalPlugin,
  professionalPlugin,
  ProfessionalLayout,
  professionalRoutes,
];

const site: SitePackage = {
  layouts: { default: PersonalLayout },
  routes: [...routes, ...personalRoutes, extraRoute],
  plugin: (config) => personalSitePlugin(config),
  entityDisplay: {
    post: postDisplay,
  },
};

export default site;
