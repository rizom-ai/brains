import type { SiteDefinition } from "@rizom/site";
import { DefaultRizomLayout } from "./default-layout";
import { buildRizomHeadScript, rizomRuntimeStaticAssets } from "./plugin";

export const rizomBaseSite: SiteDefinition = {
  layouts: {
    default: DefaultRizomLayout,
  },
  routes: [],
  headScripts: [buildRizomHeadScript()],
  entityDisplay: {},
  staticAssets: rizomRuntimeStaticAssets,
};
