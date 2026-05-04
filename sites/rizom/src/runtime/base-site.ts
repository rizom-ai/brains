import type { Plugin } from "@brains/plugins";
import type { SitePackage } from "@brains/site-composition";
import { DefaultRizomLayout } from "./default-layout";
import { rizomRuntimeStaticAssets, RizomRuntimePlugin } from "./plugin";

export const rizomBaseSite: SitePackage<Record<string, unknown>, Plugin> = {
  layouts: {
    default: DefaultRizomLayout,
  },
  routes: [],
  plugin: (config?: Record<string, unknown>): Plugin =>
    new RizomRuntimePlugin("@brains/site-rizom", config ?? {}),
  entityDisplay: {},
  staticAssets: rizomRuntimeStaticAssets,
};
