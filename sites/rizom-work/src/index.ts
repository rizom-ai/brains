import type { Plugin } from "@brains/plugins";
import {
  extendSite,
  type SitePackage,
  type SitePackageOverrides,
} from "@brains/site-composition";
import baseSite, { createRizomLayout } from "@brains/site-rizom";
import { workRoutes } from "./routes";
import { workShellModel } from "./shell";

const WorkLayout = createRizomLayout(workShellModel);

const workPlugin: SitePackage["plugin"] = (
  config?: Record<string, unknown>,
): Plugin => baseSite.plugin({ ...(config ?? {}), variant: "work" });

const overrides: SitePackageOverrides = {
  layouts: {
    default: WorkLayout,
  },
  routes: workRoutes,
  plugin: workPlugin,
};

const site: SitePackage = extendSite(baseSite, overrides);

export default site;
