import type { Plugin } from "@brains/plugins";
import {
  extendSite,
  type SitePackage,
  type SitePackageOverrides,
} from "@brains/site-composition";
import rizomBaseSite from "@brains/site-rizom";
import { AiLayout } from "./layout";
import { RizomAiSitePlugin } from "./plugin";
import { aiRoutes } from "./routes";

const aiPlugin: SitePackage["plugin"] = (
  config?: Record<string, unknown>,
): Plugin => new RizomAiSitePlugin(config ?? {});

const overrides: SitePackageOverrides = {
  layouts: {
    default: AiLayout,
  },
  routes: aiRoutes,
  plugin: aiPlugin,
};

const site: SitePackage = extendSite(rizomBaseSite, overrides);

export default site;
