import {
  ProfessionalLayout,
  professionalRoutes,
  professionalSitePlugin,
  type SitePackage,
} from "@rizom/brain/site";

export const canaryMarker: string = `${JSON.stringify(
  {
    package: "@rizom/site-smoke-canary",
    purpose: "hosted-external-package-canary",
    surface: "smoke.rizom.ai",
  },
  null,
  2,
)}\n`;

const site: SitePackage = {
  layouts: {
    default: ProfessionalLayout,
  },
  routes: professionalRoutes,
  plugin: (config) => professionalSitePlugin(config),
  entityDisplay: {
    post: { label: "Signal", pluralName: "signals" },
    deck: { label: "Transmission", pluralName: "transmissions" },
    project: { label: "Experiment", pluralName: "experiments" },
    series: {
      label: "Sequence",
      navigation: { slot: "secondary" },
    },
    topic: {
      label: "Frequency",
      pluralName: "frequencies",
      navigation: { slot: "secondary" },
    },
    link: {
      label: "Relay",
      pluralName: "relays",
      navigation: { slot: "secondary" },
    },
    base: {
      label: "Field Note",
      pluralName: "field-notes",
      navigation: { show: false },
    },
  },
  staticAssets: {
    "/.well-known/rover-site-canary.json": canaryMarker,
  },
};

export default site;
