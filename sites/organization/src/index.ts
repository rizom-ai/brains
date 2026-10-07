import type { Plugin } from "@brains/plugins";
import type { SitePackage } from "@brains/site-composition";
import { SiteLayout, HOMEPAGE_ATLAS_SCRIPT } from "@brains/site-atlas";
import { computeContentHash } from "@brains/utils/hash";
import type { OrganizationSiteConfigInput } from "./config";
import { createOrganizationRuntime } from "./plugin";
import { routes } from "./routes";
import { OrganizationHomepage } from "./templates/homepage";

export { routes, OrganizationHomepage };

const atlasPath = `scripts/homepage-atlas.${computeContentHash(HOMEPAGE_ATLAS_SCRIPT).slice(0, 12)}.js`;
const site: SitePackage<OrganizationSiteConfigInput, Plugin> = {
  layouts: { default: SiteLayout },
  routes,
  plugin: createOrganizationRuntime,
  // Site-owned, deferred presentation; no new template/section script capability.
  staticAssets: { [atlasPath]: HOMEPAGE_ATLAS_SCRIPT },
  headScripts: [`<script src="/${atlasPath}" defer></script>`],
  entityDisplay: {
    agent: { label: "Agent", navigation: { slot: "primary" } },
    topic: { label: "Topic", navigation: { slot: "secondary" } },
    link: { label: "Link", navigation: { slot: "secondary" } },
    base: { label: "Note", navigation: { show: false } },
  },
};

export default site;
