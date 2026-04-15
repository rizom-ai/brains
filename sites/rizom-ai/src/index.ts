import type { Plugin } from "@brains/plugins";
import {
  extendSite,
  type SitePackage,
  type SitePackageOverrides,
} from "@brains/site-composition";
import baseSite, { createRizomLayout } from "@brains/site-rizom";
import { RizomAiSitePlugin } from "./plugin";
import { aiRoutes } from "./routes";
import { aiShellModel } from "./shell";

const AiLayout = createRizomLayout(aiShellModel);

const aiPlugin: SitePackage["plugin"] = (
  config?: Record<string, unknown>,
): Plugin => new RizomAiSitePlugin({ ...(config ?? {}), variant: "ai" });

const overrides: SitePackageOverrides = {
  layouts: {
    default: AiLayout,
  },
  routes: aiRoutes,
  plugin: aiPlugin,
};

const site: SitePackage = extendSite(baseSite, overrides);

export default site;
