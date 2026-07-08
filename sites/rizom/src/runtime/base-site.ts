import type { Plugin } from "@brains/plugins";
import type { SitePackage } from "@brains/site-composition";
import { DefaultRizomLayout } from "./default-layout";
import {
  rizomRuntimeStaticAssets,
  RizomRuntimePlugin,
  type RizomRuntimeConfigInput,
} from "./plugin";

export const rizomBaseSite: SitePackage<RizomRuntimeConfigInput, Plugin> = {
  layouts: {
    default: DefaultRizomLayout,
  },
  routes: [],
  plugin: (config?: RizomRuntimeConfigInput): Plugin =>
    new RizomRuntimePlugin("@brains/site-rizom", config ?? {}),
  entityDisplay: {},
  staticAssets: rizomRuntimeStaticAssets,
};
