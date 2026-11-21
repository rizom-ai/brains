export { default } from "./plugin";
export {
  resolveIdentityFallbacks,
  siteInfo,
  type SiteInfoConfig,
  type SiteInfoConfigInput,
} from "./plugin";
export {
  fetchRecentEntities,
  requireCta,
} from "./datasources/site-datasource-helpers";
export {
  fetchSiteInfo,
  siteInfoBodySchema,
  siteInfoCTASchema,
} from "@brains/site-composition";
export type {
  ResolvedSiteInfoBody,
  SiteInfoBody,
  SiteInfoBodyInput,
  SiteInfoCTA,
} from "@brains/site-composition";
