import type { SitePackage } from "../contracts";
import { DefaultRizomLayout } from "./default-layout";
import { rizomRuntimeStaticAssets, RizomRuntimePlugin } from "./plugin";

export const rizomBaseSite: SitePackage<
  Record<string, unknown>,
  RizomRuntimePlugin
> = {
  layouts: {
    default: DefaultRizomLayout,
  },
  routes: [],
  plugin: (config?: Record<string, unknown>): RizomRuntimePlugin =>
    new RizomRuntimePlugin("@brains/site-rizom", config ?? {}),
  entityDisplay: {},
  staticAssets: rizomRuntimeStaticAssets,
};
