/**
 * The consolidated Rizom site — one site at rizom.ai serving the platform
 * home plus the /work and /foundation rooms (see
 * docs/plans/rizom-consolidation.md, Phase 1).
 *
 * Composes the shared Rizom core (`@brains/site-rizom`) with the rev-5
 * two-tier chrome and the three room routes. Each page module exports an
 * ordered `SectionDef[]` (schema + component + fallback copy colocated);
 * the template registry and route sections derive from those lists, and
 * the package registers its own templates so it works in any brain.
 */
import type { Plugin } from "@brains/plugins";
import type { SitePackage } from "@brains/site-composition";
import type { Template } from "@brains/templates";
import {
  createRizomSite,
  type RizomRuntimeConfigInput,
} from "@brains/site-rizom";
import { foundationSections } from "./foundation";
import { homeSections } from "./home";
import { RizomAiLayout } from "./layout";
import { rizomAiRoutes } from "./routes";
import { CONTENT_NAMESPACE, toTemplates } from "./section-def";
import { workSections } from "./work";

export { RizomAiLayout } from "./layout";
export { rizomAiRoutes } from "./routes";
export { homeSections } from "./home";
export { workSections } from "./work";
export { foundationSections } from "./foundation";
export {
  CONTENT_NAMESPACE,
  defineSection,
  toRouteSections,
  toTemplates,
} from "./section-def";
export type { AnySectionDef, SectionDef } from "./section-def";

export const rizomAiTemplates: Record<string, Template> = toTemplates([
  ...homeSections,
  ...workSections,
  ...foundationSections,
]);

export const rizomAiSite: SitePackage<RizomRuntimeConfigInput, Plugin> =
  createRizomSite({
    packageName: "@brains/site-rizom-ai",
    contentNamespace: CONTENT_NAMESPACE,
    // No themeProfile: the rev-5 theme (@brains/theme-rizom-ai) owns the
    // visuals — the shared canvas backgrounds would fight it.
    layout: RizomAiLayout,
    routes: rizomAiRoutes,
    templates: rizomAiTemplates,
  });

export default rizomAiSite;
