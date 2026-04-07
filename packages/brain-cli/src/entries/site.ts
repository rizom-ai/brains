/**
 * Library export for site authoring. Re-exports the curated runtime
 * surface a standalone site repo needs to compose its `SitePackage`.
 *
 * The public type contract lives in `../types/site.d.ts` and is
 * shipped verbatim as `dist/site.d.ts` — see that file for the
 * sync rules and replacement plan.
 */

export type { Plugin } from "@brains/plugins";
export type { SitePackage } from "@brains/app";

export {
  personalSitePlugin,
  PersonalLayout,
  routes,
} from "@brains/layout-personal";
