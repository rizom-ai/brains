import type { Plugin } from "@brains/plugins";
import {
  extendSite,
  type SitePackage,
  type SitePackageOverrides,
} from "@brains/site-composition";
import baseSite, { createRizomLayout } from "@brains/site-rizom";
import { foundationRoutes } from "./routes";
import { foundationShellModel } from "./shell";

const FoundationLayout = createRizomLayout(foundationShellModel);

const foundationPlugin: SitePackage["plugin"] = (
  config?: Record<string, unknown>,
): Plugin => baseSite.plugin({ ...(config ?? {}), variant: "foundation" });

const overrides: SitePackageOverrides = {
  layouts: {
    default: FoundationLayout,
  },
  routes: foundationRoutes,
  plugin: foundationPlugin,
};

const site: SitePackage = extendSite(baseSite, overrides);

export default site;
