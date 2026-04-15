import type { Plugin } from "@brains/plugins";
import { rizomBaseSite } from "@brains/rizom-runtime";
import { extendSite, type SitePackage } from "@brains/site-composition";
import { routes } from "./routes";
import { RizomSitePlugin } from "./plugin";

/**
 * Rizom site package — shared by rizom.ai, rizom.foundation,
 * and rizom.work.
 *
 * At this point it mainly owns:
 *
 * - family-owned ecosystem template registration
 * - thin site-package glue over shared Rizom runtime/ui packages
 * - optional legacy direct-consumer entrypoint behavior
 */
export { routes };
export { RizomSitePlugin } from "./plugin";

const site: SitePackage = extendSite(rizomBaseSite, {
  plugin: (config?: Record<string, unknown>): Plugin =>
    new RizomSitePlugin(config ?? {}),
});

export default site;
