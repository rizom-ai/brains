import type { SitePackage } from "@rizom/brain/site";
import { SmokeCanarySitePlugin, smokeCanarySitePlugin } from "./plugin";
import { CanaryLayout } from "./layouts/CanaryLayout";
import { CanaryHomeLayout, type CanaryHomeData } from "./templates/canary-home";
import { routes } from "./routes";
import { canaryMarker, canaryStatus, type CanaryStatus } from "./canary";

export {
  SmokeCanarySitePlugin,
  smokeCanarySitePlugin,
  CanaryLayout,
  CanaryHomeLayout,
  type CanaryHomeData,
  routes,
  canaryMarker,
  canaryStatus,
  type CanaryStatus,
};

/**
 * Minimal, content-independent canary site. Owns no entity types and depends
 * on no brain content — its single route renders a static template that proves
 * the externally-hosted site+theme package loads, builds, deploys, and styles.
 */
const site: SitePackage = {
  layouts: {
    default: CanaryLayout,
  },
  routes,
  plugin: (config) => smokeCanarySitePlugin(config as Record<string, never>),
  entityDisplay: {},
  staticAssets: {
    "/.well-known/rover-site-canary.json": canaryMarker,
  },
};

export default site;
