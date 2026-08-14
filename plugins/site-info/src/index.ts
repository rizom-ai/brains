export { SiteInfoPlugin, siteInfoPlugin } from "./plugin";
export { SiteInfoAdapter } from "./entity/adapter";
export { SiteInfoService } from "./services/site-info-service";
export { fetchSiteInfo } from "@brains/site-composition";
export { SiteInfoDataSource } from "./datasources/site-info-datasource";
export {
  fetchRecentEntities,
  requireCta,
} from "./datasources/site-datasource-helpers";

export type { SiteInfo } from "./entity/types";
export { SiteInfoSchema } from "./entity/types";

export type {
  SiteInfoEntity,
  SiteInfoBody,
  SiteInfoCTA,
  SiteInfoMetadata,
} from "./entity/schema";
export {
  siteInfoSchema,
  siteInfoBodySchema,
  siteInfoCTASchema,
  siteInfoMetadataSchema,
} from "./entity/schema";
