/**
 * Library export for site authoring. Re-exports the curated runtime
 * surface a standalone site repo needs to compose its `SitePackage`.
 *
 * The public type contract lives in `../types/site.d.ts` and is
 * shipped verbatim as `dist/site.d.ts` — see that file for the
 * sync rules and replacement plan.
 */

export type { Plugin } from "@brains/plugins";
export type { SitePackage } from "@brains/site-composition";

export {
  personalSitePlugin,
  PersonalLayout,
  routes,
  routes as personalRoutes,
} from "@brains/site-personal";

export {
  professionalSitePlugin,
  ProfessionalLayout,
  routes as professionalRoutes,
} from "@brains/site-professional";
