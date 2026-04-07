/**
 * Library export for site authoring.
 *
 * Anything a standalone site repo needs to compose its `SitePackage`
 * — layouts, routes, plugin types — is re-exported here.
 *
 * Consumed via:
 *
 * ```ts
 * import {
 *   personalSitePlugin,
 *   PersonalLayout,
 *   routes,
 * } from "@rizom/brain/site";
 * import type { Plugin, SitePackage } from "@rizom/brain/site";
 * ```
 *
 * See `docs/plans/library-exports.md` for the broader plan and the
 * other tiers (themes, plugins, entities, services, etc.) deferred
 * until real consumers need them.
 */

export type { Plugin } from "@brains/plugins";
export type { SitePackage } from "@brains/app";

export {
  personalSitePlugin,
  PersonalLayout,
  routes,
} from "@brains/layout-personal";
