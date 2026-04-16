import type { Plugin } from "@brains/plugins";
import {
  extendSite,
  type SitePackage,
  type SitePackageOverrides,
} from "@brains/site-composition";
import rizomBaseSite from "@brains/site-rizom";
import { WorkLayout } from "./layout";
import { RizomWorkSitePlugin } from "./plugin";
import { workRoutes } from "./routes";

const workPlugin: SitePackage["plugin"] = (
  config?: Record<string, unknown>,
): Plugin => new RizomWorkSitePlugin(config ?? {});

const overrides: SitePackageOverrides = {
  layouts: {
    default: WorkLayout,
  },
  routes: workRoutes,
  plugin: workPlugin,
};

const site: SitePackage = extendSite(rizomBaseSite, overrides);

export default site;
