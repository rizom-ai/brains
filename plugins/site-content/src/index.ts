import { siteContentService } from "./service";

// The brain's page sections: what a site says, as records it can regenerate.
export { siteContentService } from "./service";
export { siteContentEntity, type SiteContentEntity } from "./entity";
export {
  fillSectionJob,
  handleFillSection,
  sectionEntityId,
  type FillSectionInput,
} from "./fill-section";
export { sectionTemplates } from "./sections";
export { createSiteContentTemplates } from "./lib/site-content-definitions";
export type { SiteContent, SiteContentMetadata } from "./schemas/site-content";
export {
  siteContentSchema,
  siteContentMetadataSchema,
} from "./schemas/site-content";
export {
  siteContentPluginConfigSchema,
  type SiteContentPluginConfig,
  type SiteContentPluginConfigInput,
} from "./schemas/config";
export type {
  SiteContentDefinition,
  SiteContentFieldDefinition,
  SiteContentSectionDefinition,
} from "./definitions";

/** Site content as a brain composes it. */
const siteContentPackage: ReturnType<typeof siteContentService> =
  siteContentService();
export default siteContentPackage;
