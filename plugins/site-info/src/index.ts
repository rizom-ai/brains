import siteInfoPackage from "./plugin";

export default siteInfoPackage;
export { siteInfo, resolveIdentityFallbacks } from "./plugin";
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
