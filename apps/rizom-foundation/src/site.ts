import type { Plugin } from "@brains/plugins";
import {
  extendSite,
  type SitePackage,
  type SitePackageOverrides,
} from "@brains/site-composition";
import rizomBaseSite from "@brains/site-rizom";
import { FoundationLayout } from "./layout";
import { RizomFoundationSitePlugin } from "./plugin";
import { foundationRoutes } from "./routes";

const foundationPlugin: SitePackage["plugin"] = (
  config?: Record<string, unknown>,
): Plugin => new RizomFoundationSitePlugin(config ?? {});

const overrides: SitePackageOverrides = {
  layouts: {
    default: FoundationLayout,
  },
  routes: foundationRoutes,
  plugin: foundationPlugin,
};

const site: SitePackage = extendSite(rizomBaseSite, overrides);

export default site;
