/**
 * The consolidated Rizom site — one site at rizom.ai serving the platform
 * home plus the /work and /foundation rooms (see
 * docs/plans/rizom-consolidation.md, Phase 1).
 *
 * Composes the shared Rizom core (`@brains/site-rizom`) with the rev-5
 * two-tier chrome and the three room routes. Section copy ships as static
 * fallbacks so the site renders without content entities, and the package
 * registers its own templates so it works in any brain.
 */
import type { Plugin } from "@brains/plugins";
import type { SitePackage } from "@brains/site-composition";
import {
  createRizomSite,
  type RizomRuntimeConfigInput,
} from "@brains/site-rizom";
import { rizomAiTemplates } from "./content";
import { RizomAiLayout } from "./layout";
import { rizomAiRoutes } from "./routes";

export { RizomAiLayout } from "./layout";
export { rizomAiRoutes } from "./routes";
export {
  FOUNDATION_HERO_FALLBACK,
  HOME_HERO_FALLBACK,
  WORK_HERO_FALLBACK,
  foundationHeroContentSchema,
  homeHeroContentSchema,
  rizomAiTemplates,
  workHeroContentSchema,
} from "./content";
export {
  FoundationHeroSection,
  HomeHeroSection,
  WorkHeroSection,
} from "./sections";
export type {
  CtaLink,
  FoundationHeroContent,
  HomeHeroContent,
  WorkHeroContent,
} from "./sections";

export const rizomAiSite: SitePackage<RizomRuntimeConfigInput, Plugin> =
  createRizomSite({
    packageName: "@brains/site-rizom-ai",
    contentNamespace: "rizom-ai-site",
    themeProfile: "product",
    layout: RizomAiLayout,
    routes: rizomAiRoutes,
    templates: rizomAiTemplates,
  });

export default rizomAiSite;
